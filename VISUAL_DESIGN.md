# FastCal Visual Design Study

## Design Philosophy

FastCal's visual design is inspired by modern conversational AI interfaces (like ChatGPT) with a focus on clarity, minimalism, and reducing cognitive load. The interface prioritizes the conversation flow while providing a clean, glanceable calendar view.

The goal is to provide an information dense way to view and manage events while remaining simple and easy to use.

## Color Palette

### Visual Representation

```
┌─────────────────────────────────────────────────────────────┐
│  BACKGROUND COLORS                                          │
├─────────────────────────────────────────────────────────────┤
│  ████ #1F2937 (gray-800)  Main backgrounds                │
│  ████ #374151 (gray-700)  Cards, surfaces                 │
│  ████ #4B5563 (gray-600)  Borders, dividers               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  TEXT COLORS                                                │
├─────────────────────────────────────────────────────────────┤
│  ████ #FFFFFF (white)     Headings, important text        │
│  ████ #D1D5DB (gray-300)  Body text                       │
│  ████ #9CA3AF (gray-400)  Metadata, timestamps            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  ACCENT COLORS                                              │
├─────────────────────────────────────────────────────────────┤
│  ████ #2563EB (blue-600)  User messages, primary actions  │
│  ████ #3B82F6 (blue-500)  Google Calendar events          │
│  ████ #10B981 (green-500) Success, confirmations          │
│  ████ #EF4444 (red-500)   Errors, delete actions          │
└─────────────────────────────────────────────────────────────┘
```

### Color Psychology

Dark backgrounds are used to reduce eye strain and create a professional atmosphere. Blue accents are in line with Google Calendar and are a natural choice for user messages and primary actions. Green and red are used for success and error messages respectively.

## Typography

### Visual Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│  FONT SIZES & WEIGHTS                                       │
├─────────────────────────────────────────────────────────────┤
│  Your Calendar          24px / Bold    (h2, section titles) │
│  Event Title            14px / Medium  (body, chat)         │
│  Event Location         12px / Regular (metadata)           │
│  Timestamp              12px / Regular (time, date)         │
└─────────────────────────────────────────────────────────────┘
```

### Font Family
**System Font Stack**: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`

### What the Typography Communicates

System fonts are used to communicate a sense of familiarity and trustworthiness. The compact sizing and clear hierarchy are used to easily display information dense content.

## Layout Structure

### Two-Panel Split
The interface is divided into two equal panels (50/50 split):

Left panel:
- Fixed header with title and refresh button
- Scrollable event list
- Compact timeline layout

Right panel:
- Fixed header with title and clear button
- Scrollable message area
- Fixed input bar at bottom

The 50/50 split gives equal importance to both the calendar view and the conversation. Users can see their events while chatting without switching contexts.

## Component Design

### Chat Messages

The color distinction makes it immediately clear who's speaking. The rounded corners soften the interface and feel more conversational.

### Action Buttons

Green/red is universally understood for accept/reject. Small size keeps them unobtrusive until needed.

### Calendar Events

The timeline layout is space-efficient and scannable. The color bar provides instant visual categorization. Hover-reveal for delete reduces visual clutter.

### Input Field

The prominent send button encourages interaction. The up arrow is familiar from messaging apps.

## Iconography

- **📅** Calendar emoji for event creation
- **✏️** Pencil emoji for editing
- **🗑️** Trash emoji for deletion
- **✓** Checkmark for confirmation
- **📍** Pin emoji for location
- **👥** People emoji for participants
- **↑** Up arrow for send

Emojis are universally understood and add personality.

## Responsive Considerations

While the current design is optimized for desktop, the component structure supports future responsive adaptations:

- Flexbox layouts can stack vertically on mobile
- Max-width constraints prevent overflow
- Scrollable containers handle varying content lengths
