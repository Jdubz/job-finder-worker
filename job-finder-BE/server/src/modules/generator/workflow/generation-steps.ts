import type { GenerationStep, GenerationType } from '@shared/types'

interface GenerationStepInit {
  id: string
  name: string
  description: string
}

const BASE_STEPS: Record<GenerationType, GenerationStepInit[]> = {
  resume: [
    {
      id: 'collect-data',
      name: 'Collect Data',
      description: 'Gather personal info, experiences, and job context'
    },
    {
      id: 'generate-resume',
      name: 'Generate Resume',
      description: 'Invoke AI provider to create resume content'
    },
    {
      id: 'render-pdf',
      name: 'Render PDF',
      description: 'Convert resume content into branded PDF'
    }
  ],
  coverLetter: [
    {
      id: 'collect-data',
      name: 'Collect Data',
      description: 'Gather personal info and job summary'
    },
    {
      id: 'generate-cover-letter',
      name: 'Generate Cover Letter',
      description: 'Invoke AI provider to craft a tailored cover letter'
    },
    {
      id: 'render-pdf',
      name: 'Render PDF',
      description: 'Convert cover letter into branded PDF'
    }
  ],
  both: [
    {
      id: 'collect-data',
      name: 'Collect Data',
      description: 'Gather personal info, experiences, and job context'
    },
    {
      id: 'generate-resume',
      name: 'Generate Resume',
      description: 'Invoke AI provider to create resume content'
    },
    {
      id: 'generate-cover-letter',
      name: 'Generate Cover Letter',
      description: 'Invoke AI provider to craft a cover letter'
    },
    {
      id: 'render-pdf',
      name: 'Render PDF',
      description: 'Render resume and cover letter PDFs'
    }
  ]
}

export function createInitialSteps(type: GenerationType): GenerationStep[] {
  const templates = BASE_STEPS[type] ?? []
  return templates.map<GenerationStep>((step) => ({
    ...step,
    status: 'pending'
  }))
}

export function startStep(steps: GenerationStep[], id: string): GenerationStep[] {
  return steps.map((step) =>
    step.id === id
      ? {
          ...step,
          status: 'in_progress',
          startedAt: new Date().toISOString()
        }
      : step
  )
}

export function completeStep(
  steps: GenerationStep[],
  id: string,
  status: Extract<GenerationStep['status'], 'completed' | 'failed'>,
  result?: GenerationStep['result'],
  error?: GenerationStep['error']
): GenerationStep[] {
  return steps.map((step) =>
    step.id === id
      ? {
          ...step,
          status,
          completedAt: new Date().toISOString(),
          duration:
            step.startedAt != null
              ? Date.now() - new Date(step.startedAt).getTime()
              : undefined,
          result: result ?? step.result,
          error: error ?? step.error
        }
      : step
  )
}
