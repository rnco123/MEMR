# MyclinicMD

Modern video conferencing application built with Next.js, Supabase, and Daily.co.

## Features

- 🎥 Video conferencing powered by Daily.co
- 🔐 Authentication and database with Supabase
- ⚡ Built with Next.js 14 (App Router)
- 🎨 Styled with Tailwind CSS
- 📱 Responsive design

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
   - Copy `.env.local.example` to `.env.local`
   - Fill in your Supabase credentials:
     - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anonymous key
     - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (optional, for server-side operations)
   - Fill in your Daily.co credentials:
     - `NEXT_PUBLIC_DAILY_API_KEY`: Your Daily.co API key
     - `NEXT_PUBLIC_DAILY_DOMAIN`: Your Daily.co domain

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
MyclinicMD/
├── app/              # Next.js app directory
│   ├── layout.tsx    # Root layout
│   ├── page.tsx      # Home page
│   ├── video/        # Video call page
│   └── globals.css   # Global styles
├── lib/              # Utility libraries
│   ├── supabase/     # Supabase client setup
│   └── daily.ts      # Daily.co integration
└── public/           # Static assets
```

## Environment Variables

You'll need to provide the following environment variables:

### Supabase
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL (found in your Supabase dashboard)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anonymous/public key
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (for server-side operations)

### Daily.co
- `NEXT_PUBLIC_DAILY_API_KEY`: Your Daily.co API key (found in your Daily.co dashboard)
- `NEXT_PUBLIC_DAILY_DOMAIN`: Your Daily.co domain (e.g., `your-domain.daily.co`)

## Usage

1. Start the development server
2. Navigate to the home page
3. Click "Start Video Call" to join a video room
4. Use the "Leave Call" button to exit

## Technologies

- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe JavaScript
- **Tailwind CSS**: Utility-first CSS framework
- **Supabase**: Backend as a service (authentication, database)
- **Daily.co**: Video conferencing SDK

## License

MIT
