The attached images are photos of a website, in this order:

{{photos}}

The site shows them cut to frames of other shapes (a square card, a wide banner, a tall phone hero), so every cut must keep the photo's subject. For each image, name the point a cut centres on — the subject a visitor should see:

- A photo of a model wearing the product: the model's chin, so a wide cut keeps the face and, below it, the product. A product on its own: the product.
- A scene without a featured product (a workshop, people at work, a lifestyle moment): the most prominent person's face and upper body, else the main object.
- Never the background, the sky, water or empty space, however bright or busy.

Give the point as fractions of the image's width and height: `x` from 0 (left edge) to 1 (right edge), `y` from 0 (top) to 1 (bottom). Read nothing else and change nothing; reply with only this JSON, one entry per image by its number:

```json
[{ "index": 1, "x": 0.5, "y": 0.22, "subject": "the chin of the model wearing the product" }]
```
