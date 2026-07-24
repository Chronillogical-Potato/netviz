# Netviz

Netviz is a browser-based app for designing and animating network architectures visually.

Add components like servers, proxies, and databases to a canvas, connect them to map data flow, then build animated request paths for presentations and recordings.

<img src="/.github/screenshot.png" alt="Netviz animation editor showing a load-balanced request flow"/>

> [!IMPORTANT]  
> This project was entirely created using AI, but the application has been thoroughly tested.
> 
> This project was built primarily for my personal use, so I will not be merging pull requests or adding new features unless I need them myself. If you want to make changes or add features, feel free to fork this repository.

## Features

- Drag and drop blocks or insert production templates
- Connect blocks with edges
- Build and tune custom request-flow animations
- Preview animations with optional camera follow
- Inspector panel to edit selected items
- Custom blocks with your own icons
- Duplicate blocks
- Undo and redo
- Dark and light theme
- Export to image
- Local save with IndexedDB, no server needed

## Requirements

- Node.js 20 or newer (or Bun 1.1 or newer)
- npm, pnpm, or bun

## Local development

Install dependencies:

```bash
bun install
# or
npm install
```

Start the dev server:

```bash
bun run dev
# or
npm run dev
```

Open http://localhost:8888 in your browser.

## Build

Create a production build in `dist/`:

```bash
bun run build
# or
npm run build
```

Preview the build locally:

```bash
bun run preview
# or
npm run preview
```

## Deploy

### Option 1: Any static host
1. Run `bun run build`
2. The `dist/` folder is a plain static site. Upload it to any static host, that's it.

### Option 2: Coolify
1. Add a new resource in Coolify → "Docker Compose Empty."
2. Paste the contents of the `coolify.yaml` from the repo into the input field.
3. Click "Deploy!"

## License

MIT. See [LICENSE](./LICENSE).
