# Cotana Link Index

Personal link cards collected from Telegram messages.

## Add a Link

```bash
node add-link.mjs "https://example.com" 읽을거리
```

Then open `index.html` in a browser. The page reads `links-data.js`, so it works without a local server.

## Manage in Browser

- `Open` marks a card as `완료` and stores the opened date.
- Clicking a card opens the internal summary panel instead of the source site.
- Use `Open original` in the summary panel to visit the source.
- Cards keep a short `summary`; the detail panel uses the longer `detail` field when available.
- Add/delete/status changes are saved to browser `localStorage`.
- Use `Export JSON` to download the current browser-managed list.
- `Reset local edits` clears browser changes and reloads the original `links-data.js`.
