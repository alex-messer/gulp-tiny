# gulp-tiny — Claude Working Rules

## Branch
- Work exclusively on the `main` branch

## Workflow
1. Implement the feature
2. Run the tests (`npm test`) — only proceed if all tests are green
3. Commit with a clear message
4. Push to `origin/main` immediately after committing
5. Local state and remote must always be 100% in sync

## Test Scripts
- `npm test` — run the full test suite (node:test)
- `npm run coverage` — run tests with coverage report
- `npm run test:watch` — interactive watch mode during development

## Language
- Code, comments, and documentation: English
- Conversation with the user: German
