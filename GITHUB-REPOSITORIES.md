# GitHub Repositories

Repos are checked top-to-bottom. Set enabled to false to keep a repo in the list without indexing it.
Set pages to true to use the fast GitHub Pages read-path instead of recursive Octokit calls.
Set STREAM to the subject workspace that should receive the repository's `files.json` tree.


| name          | stream     | repo                      | branch | root | enabled | priority | pages |
| ------------- | ---------- | ------------------------- | ------ | ---- | ------- | -------- | ----- |
| NCERT-SCIENCE | SCIENCE    | fsr-science/NCERT-Science | main   |      | true    | 1        | true  |
| NCERT-COMMERCE | COMMERCE  | fsr-commerce/NCERT-Commerce | main |      | true    | 2        | true  |
| NCERT-HUMANITIES | HUMANITIES | fsr-humanities/NCERT-Humanities | main |      | true    | 3        | true  |
