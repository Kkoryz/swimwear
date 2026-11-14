"""Style closeness of generated photos to the reference site's photos, by CSD style embeddings (Somepalli et al. 2024,
"Measuring Style Similarity in Diffusion Models", github.com/learn2phoenix/CSD, MIT; weights tomg-group-umd/CSD-ViT-L).

Usage: python csd_score.py <request.json> <reply.json>
request: {"weights": "<pytorch_model.bin>", "refs": [paths], "images": [paths], "k": 5}
reply: {"scores": [one per image: mean cosine of its style vector to its k nearest reference photos]}
The CLIP ViT-L/14 image tower is built from its shape: CSD's checkpoint holds the whole backbone and the style
projection, so the CLIP weights are never downloaded.
"""
import argparse
import json
import sys

import numpy as np
import torch
from clip.model import VisionTransformer
from PIL import Image
from torchvision import transforms

# The checkpoint carries its training arguments and numpy scalars: allow just those and keep weights_only loading.
SAFE = [(np._core.multiarray.scalar, "numpy.core.multiarray.scalar"), np.dtype, type(np.dtype("float64")), type(np.dtype("int64")), argparse.Namespace]
PREPROCESS = transforms.Compose([
    transforms.Resize(224, interpolation=transforms.InterpolationMode.BICUBIC),
    transforms.CenterCrop(224),
    transforms.ToTensor(),
    transforms.Normalize((0.48145466, 0.4578275, 0.40821073), (0.26862954, 0.26130258, 0.27577711)),
])


def load(weights):
    with torch.serialization.safe_globals(SAFE):
        state = torch.load(weights, map_location="cpu", weights_only=True)["model_state_dict"]
    backbone = VisionTransformer(input_resolution=224, patch_size=14, width=1024, layers=24, heads=16, output_dim=768)
    backbone.proj = None
    prefix = "module.backbone."
    backbone.load_state_dict({key[len(prefix):]: value for key, value in state.items() if key.startswith(prefix)})
    return backbone.float().eval(), state["module.last_layer_style"].float()


def embed(model, paths):
    backbone, style = model
    vectors = []
    with torch.no_grad():
        for start in range(0, len(paths), 8):
            batch = torch.stack([PREPROCESS(Image.open(path).convert("RGB")) for path in paths[start:start + 8]])
            vectors.append(torch.nn.functional.normalize(backbone(batch) @ style, dim=1, p=2).numpy())
    return np.concatenate(vectors) if vectors else np.zeros((0, 768))


def main(request_path, reply_path):
    request = json.loads(open(request_path, encoding="utf-8").read())
    model = load(request["weights"])
    refs = embed(model, request["refs"])
    images = embed(model, request["images"])
    k = min(request.get("k", 5), len(refs))
    scores = [float(np.sort(refs @ vector)[::-1][:k].mean()) for vector in images]
    open(reply_path, "w", encoding="utf-8").write(json.dumps({"scores": scores}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
