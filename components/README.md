# Components

## LoadingSpinner

A reusable loading component with percentage indicators for all loading states in the application.

### Usage

```tsx
import { LoadingSpinner } from '@/components/LoadingSpinner'

// Basic usage
<LoadingSpinner message="Loading..." />

// With custom message
<LoadingSpinner message="Loading appointments..." />

// With explicit progress (0-100)
<LoadingSpinner message="Loading..." progress={75} />

// Different sizes
<LoadingSpinner message="Loading..." size="sm" />
<LoadingSpinner message="Loading..." size="md" />
<LoadingSpinner message="Loading..." size="lg" />

// Hide percentage
<LoadingSpinner message="Loading..." showPercentage={false} />
```

### Props

- `message?: string` - Loading message to display (default: "Loading...")
- `showPercentage?: boolean` - Show percentage indicator (default: true)
- `progress?: number` - Explicit progress value (0-100). If not provided, simulates progress automatically
- `size?: 'sm' | 'md' | 'lg'` - Size of the spinner (default: 'md')
- `className?: string` - Additional CSS classes

### Features

- ✅ Automatic progress simulation (stops at 95% until loading completes)
- ✅ Percentage overlay on spinner
- ✅ Progress bar below message
- ✅ Smooth animations
- ✅ Responsive design
- ✅ Customizable sizes

### Future Use

This component should be used for all future loading states in the application to maintain consistency and provide better user feedback.
