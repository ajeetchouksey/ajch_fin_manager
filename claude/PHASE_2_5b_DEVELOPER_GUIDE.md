# Phase 2.5b: Developer Quick Start Guide

**Target Audience:** Frontend developers integrating onboarding components  
**Time to Read:** 5 minutes

## Quick Summary

Phase 2.5b provides 5 pre-built React components + 2 hooks for smooth onboarding:

```
FirstLoginOnboarding ──→ Quick setup (3 questions, 2-3 min)
                  ↓
         DashboardPage
                  ↓
ProgressiveOnboardingModal ──→ Detailed setup (5 focus areas)
                  ↓
         SlashCommandPalette ──→ Keyboard access (/ command)
```

## Component Usage Examples

### 1. Use in DashboardPage (Already Implemented)

```tsx
import { FirstLoginOnboarding } from '../components/FirstLoginOnboarding'
import { useOnboarding } from '../hooks/useOnboarding'

export function DashboardPage() {
  const [showFirstLogin, setShowFirstLogin] = useState(false)
  const { checkStatus } = useOnboarding()

  useEffect(() => {
    const checkOnboardingStatus = async () => {
      const status = await checkStatus()
      if (status && !status.hasSchema) {
        setShowFirstLogin(true)
      }
    }
    checkOnboardingStatus()
  }, [checkStatus])

  return (
    <>
      <Layout>{/* dashboard content */}</Layout>
      
      {showFirstLogin && (
        <FirstLoginOnboarding
          onComplete={() => setShowFirstLogin(false)}
          onSkip={() => setShowFirstLogin(false)}
        />
      )}
    </>
  )
}
```

### 2. Trigger ProgressiveOnboarding from Slash Command

```tsx
const handleCommandExecuted = (command: SlashCommand) => {
  if (command === 'onboarding-help') {
    setShowProgressiveOnboarding(true)
  }
}

return (
  <>
    <SlashCommandPalette
      onCommandExecuted={handleCommandExecuted}
      handlers={{
        'onboarding-help': () => setShowProgressiveOnboarding(true),
      }}
    />
    
    {showProgressiveOnboarding && (
      <ProgressiveOnboardingModal
        onClose={() => setShowProgressiveOnboarding(false)}
      />
    )}
  </>
)
```

### 3. Use useOnboarding Hook Directly

```tsx
import { useOnboarding } from '../hooks/useOnboarding'

function MyCustomComponent() {
  const {
    messages,
    loading,
    error,
    currentSchema,
    sendMessage,
    submitSchema,
    getCurrentSchema,
  } = useOnboarding({ type: 'progressive', focus: 'investments' })

  useEffect(() => {
    getCurrentSchema()
  }, [getCurrentSchema])

  const handleSend = async (msg: string) => {
    await sendMessage(msg)
  }

  return (
    <div>
      {messages.map((msg, idx) => (
        <OnboardingChatMessage key={idx} message={msg} />
      ))}
      <ChatInput onSendMessage={handleSend} loading={loading} />
      {error && <p className="error">{error}</p>}
    </div>
  )
}
```

## Hook API Reference

### useOnboarding(options?)

**Options:**
```typescript
{
  type?: 'initial' | 'progressive'
  focus?: 'investments' | 'household' | 'goals' | 'tax' | 'categories'
}
```

**State:**
```typescript
{
  messages: OnboardingMessage[]           // Chat history
  loading: boolean                        // API call in progress
  error: string | null                    // Error message
  currentSchema: UserSchemaDefinition | null // User's schema
  onboardingStatus: OnboardingStatusResponse | null
}
```

**Methods:**
```typescript
checkStatus()                    // GET /api/onboarding/status
getCurrentSchema()               // GET /api/onboarding/current-schema
sendMessage(content: string)     // POST /api/onboarding/chat
submitSchema(schema, merge?)     // POST /api/onboarding/submit
resetOnboarding()                // POST /api/onboarding/reset
cancel()                         // Abort current request
```

### useSlashCommands(handlers?)

**Options:**
```typescript
{
  'onboarding-help'?: () => void
  'reset-setup'?: () => void
  'settings'?: () => void
}
```

**State:**
```typescript
{
  isOpen: boolean                  // Palette visible
  input: string                    // Current command text
  suggestions: SlashCommand[]      // Filtered commands
}
```

**Methods:**
```typescript
executeCommand(command: SlashCommand)
setIsOpen(boolean)
setInput(string)
```

## Common Patterns

### Pattern 1: Modal that Saves on Complete

```tsx
const { currentSchema, submitSchema } = useOnboarding()
const [isSubmitting, setIsSubmitting] = useState(false)

const handleComplete = async () => {
  if (!currentSchema || isSubmitting) return
  setIsSubmitting(true)
  try {
    await submitSchema(currentSchema, true) // merge=true
    onComplete()
  } finally {
    setIsSubmitting(false)
  }
}

return <button onClick={handleComplete}>Save & Close</button>
```

### Pattern 2: Loading States

```tsx
const { loading, error } = useOnboarding()

return (
  <>
    {loading && <Spinner />}
    {error && <ErrorAlert message={error} />}
    <input disabled={loading} />
  </>
)
```

### Pattern 3: Focus Area Selection

```tsx
const [selectedFocus, setSelectedFocus] = useState<FocusArea | null>(null)
const { sendMessage } = useOnboarding({ 
  type: 'progressive',
  focus: selectedFocus || undefined 
})

return (
  <div>
    <menu>
      {FOCUS_AREAS.map(area => (
        <button onClick={() => setSelectedFocus(area.id)}>
          {area.label}
        </button>
      ))}
    </menu>
    {selectedFocus && <ChatArea />}
  </div>
)
```

## Data Structures

### UserSchemaDefinition

```typescript
{
  residenceCountries: ['US', 'CA']           // ISO country codes
  accountTypes: ['bank', 'investment']       // predefined types
  expenseCategories: ['Food', 'Transport']   // custom strings
  declaredGoals?: ['Retirement', 'House']
  householdMembers?: [
    { name: 'Alice', relationship: 'spouse' }
  ]
  investmentPreferences?: {
    hasInvestments: true
    types: ['stocks', 'etfs']
  }
  taxSettings?: {
    country: 'US'
    fillingStatus: 'single'
  }
}
```

### OnboardingMessage

```typescript
{
  role: 'user' | 'assistant'
  content: string
}
```

## Environment Variables

**Development (.env.local):**
```
VITE_API_URL=http://localhost:8787
```

**Production:**
```
VITE_API_URL=https://api.aaryaai.com
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Open command palette (from any page) |
| `Esc` | Close modal/palette |
| `Enter` | Send message (in chat) |
| `Shift+Enter` | New line in message |

## Testing

### Test First-Login Flow

```typescript
// Mock that user has no schema
vi.mock('../hooks/useOnboarding', () => ({
  useOnboarding: () => ({
    checkStatus: vi.fn().mockResolvedValue({ hasSchema: false })
  })
}))

render(<DashboardPage />)
expect(screen.getByText(/Quick Setup/i)).toBeInTheDocument()
```

### Test Message Sending

```typescript
const { result } = renderHook(() => useOnboarding())

await act(async () => {
  await result.current.sendMessage('Test message')
})

expect(result.current.messages).toHaveLength(2) // user + assistant
```

### Test Schema Submission

```typescript
const { result } = renderHook(() => useOnboarding())

await act(async () => {
  await result.current.submitSchema({
    residenceCountries: ['US'],
    accountTypes: ['bank'],
    expenseCategories: ['Food']
  })
})

expect(result.current.currentSchema).toBeDefined()
```

## Troubleshooting

### Issue: Modal won't appear on first login
**Solution:** Ensure `checkStatus()` is called in useEffect, check backend is running

### Issue: Messages don't appear in chat
**Solution:** Check `useOnboarding` hook messages state, verify API response in Network tab

### Issue: Slash command doesn't work
**Solution:** Ensure SlashCommandPalette is rendered, check handlers are provided

### Issue: Schema not saving
**Solution:** Verify `submitSchema` is called with valid schema, check backend validation errors

### Issue: Fallback to form shows
**Solution:** Backend doesn't have Gemini API key configured, check backend logs

## Common Customizations

### Change Focus Areas
Edit `FOCUS_AREAS` in `ProgressiveOnboardingModal.tsx`:
```typescript
const FOCUS_AREAS = [
  { id: 'custom', label: 'Custom Area', ... }
]
```

### Change Initial Questions (FirstLoginOnboarding)
Edit system prompt in `GeminiService` backend (Phase 2.5a):
```typescript
// In geminiService.ts buildSystemPrompt()
return `Your new prompt here...`
```

### Customize Error Messages
Edit error handling in `useOnboarding` hook:
```typescript
catch (err) {
  setError(`Custom error: ${err.message}`)
}
```

### Add New Slash Commands
Update `SlashCommand` type and handlers:
```typescript
type SlashCommand = 'onboarding-help' | 'reset-setup' | 'settings' | 'my-new-command'
```

## Performance Tips

✅ **Memoize callbacks:**
```typescript
const handleSubmit = useCallback(async () => {
  await submitSchema(schema)
}, [schema, submitSchema])
```

✅ **Lazy load modals:**
```typescript
const ProgressiveOnboardingModal = lazy(() =>
  import('../components/ProgressiveOnboardingModal')
)
```

✅ **Defer large lists:**
```typescript
{messages.length > 50 && (
  <VirtualList items={messages} />
)}
```

## Links & References

- **Backend Docs:** `PHASE_2_5a_BACKEND_FOUNDATION_COMPLETE.md`
- **Full Component Docs:** `PHASE_2_5b_FRONTEND_COMPONENTS_COMPLETE.md`
- **Type Definitions:** `frontend/src/types/index.ts`
- **Component Code:** `frontend/src/components/`
- **Hook Code:** `frontend/src/hooks/`

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review component implementation in `frontend/src/`
3. Check backend logs for API errors
4. Search GitHub issues for similar problems
