# Tech Stack

## Frontend
- **Framework**: Next.js (latest stable, App Router)
- **Styling**: Tailwind CSS 4
- **Components**: shadcn/ui with sidebar-08 layout

## Backend
- **Database & Functions**: Convex
- **Real-time**: Convex subscriptions (for live port status updates)

## Infrastructure
- **Hosting**: Vercel
- **CLI Tools**: Vercel CLI, Convex CLI, GitHub CLI (`gh`)

## Development Setup
1. `npm install`
2. `npx convex dev` (in separate terminal)
3. `npm run dev`
4. Open `http://localhost:3000`

## External Dependencies
- GitHub CLI (`gh`) - for creating repos programmatically
- Node.js process management - for detecting running dev servers
