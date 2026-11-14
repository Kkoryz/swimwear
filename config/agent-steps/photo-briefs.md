You plan the photographs of one page of a website. The site belongs to {{siteKind}}. Its photos are new photographs made for it of its own work: the places it works in, the people it serves and its staff at work. They are made by an image model, so each must be a single, concrete, photographable moment.

The page: "{{label}}" ({{route}}, a {{pageType}} page).{{status}}

Its copy, section by section (each section's id in brackets):

{{text}}

The photo positions to fill (section id, its heading, how many photos):

{{slots}}

For each position write one photograph that shows what its section is about, as a real scene of this business:

- section: the section id, as listed.
- content: what the photo shows, concretely: who is in it, doing what, with what; one moment and one main subject, in one sentence.
- setting: where it is taken, in a few words.
- caption: a short caption a reader would see under it.

The photos of this page each show a different scene: another place, activity or distance. Show only this business's own kind of work and the people it serves: nothing from another trade (no factory, sewing, fabric or product shoot unless the copy is about one). No screen, paper, sign or uniform with readable words, no logo, no named brand, company or real person.

Read nothing else and change nothing; reply with only this JSON on one line:

```json
{"photos": [{"section": "<section id>", "content": "...", "setting": "...", "caption": "..."}]}
```
