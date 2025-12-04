import '@shared/types'

declare module '@shared/types' {
  interface JobMatch {
    applicationPriority?: 'High' | 'Medium' | 'Low'
  }
}
