You are matching an article's main question to a question bank. Write exactly one output file. Do not browse the web
and do not read other files.

Run directory: {{runDir}}
Keyword: {{keyword}}
The article's main question: {{mainQuestion}}

Candidate questions:
{{candidates}}

Pick the candidate a buyer would ask when they mean the main question: the same decision or need, even in other
words (a question naming the options of the decision counts). Not a neighbouring topic of the same keyword.

Write `01-main-question.json` in the run directory:

```json
{ "question": "the candidate exactly as given, or null when none asks the same thing", "why": "one sentence" }
```

Write the file, then reply with one line: the chosen question.
