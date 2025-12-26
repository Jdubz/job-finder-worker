import { Volume2, Mic } from 'lucide-react'

interface WelcomeMessageProps {
  voiceEnabled: boolean
}

export function WelcomeMessage({ voiceEnabled }: WelcomeMessageProps) {
  return (
    <div className="text-muted-foreground py-4 space-y-4">
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">
          Hi! I'm Josh's career assistant.
        </p>
        <p className="text-xs mt-1">
          Ask me anything about his experience, skills, and background.
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-xs">
        <p className="font-medium text-foreground">Things I can help with:</p>
        <ul className="space-y-1 ml-3 list-disc list-outside">
          <li>Work experience and past roles</li>
          <li>Technical skills and technologies</li>
          <li>Education and certifications</li>
          <li>Projects and accomplishments</li>
        </ul>
      </div>

      {voiceEnabled && (
        <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-xs">
          <p className="font-medium text-foreground">Voice features:</p>
          <ul className="space-y-1 ml-3 list-disc list-outside">
            <li>
              <Volume2 className="w-3 h-3 inline mr-1" />
              Click the speaker icon to have responses read aloud
            </li>
            <li>
              <Mic className="w-3 h-3 inline mr-1" />
              Click the mic button to ask questions by voice
            </li>
          </ul>
        </div>
      )}

      <div className="text-center text-[10px] text-muted-foreground/70 pt-2">
        Powered by{' '}
        <a
          href="https://www.anthropic.com/claude"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          Claude
        </a>
        {voiceEnabled && (
          <>
            {' '}and{' '}
            <a
              href="https://deepgram.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Deepgram
            </a>
          </>
        )}
      </div>
    </div>
  )
}
