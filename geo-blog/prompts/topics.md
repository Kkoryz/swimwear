You are choosing the topics of new blog articles for a live B2B website. Each topic becomes one article that answers
five buyer questions. Write exactly one output file. Do not browse the web and do not read other files.

Run directory: {{runDir}}
Site: {{domain}} · Main keyword: {{keyword}} · Market: {{market}}
What the site sells: {{niche}}
Who the articles are for: {{persona}}

Questions from the site's question bank that no page or article of the site answers yet, each with its buying stage
and priority (high = asked in three or more independent sources):
{{candidates}}

The site's pages (an article must not compete with them for the same search):
{{routes}}

Articles the site already has, with the questions they answer:
{{posts}}

Topics already chosen for articles still being written (do not repeat or overlap them):
{{taken}}

Choose {{count}} new topics.

- Each topic is one decision or need of the reader, built around one candidate question as its main question. Prefer
  high-priority questions, then medium.
- No two topics, and no topic and an existing article or chosen topic, may answer the same question or be found by
  the same search.
- A topic does not target what one of the site's pages already targets (a service, product or location page).
- The topic keyword is a 2–5 word search phrase a buyer would type, containing the product word of the main keyword,
  and words that the bank's questions for this decision also use (so its questions cover the buying stages).
- focus_terms: 0–3 short phrases that narrow the angle, only when the keyword alone would match an existing article.

Write `01-topics-new.json` in the run directory:

```json
{
  "topics": [
    {
      "slug": "3–5 lowercase words joined by hyphens",
      "keyword": "the topic keyword",
      "focus_terms": [],
      "main_question": "a candidate question, exactly as given",
      "why": "one sentence: the reader's decision, and why no page or article covers it"
    }
  ]
}
```

Write the file, then reply with one line: the slugs.
