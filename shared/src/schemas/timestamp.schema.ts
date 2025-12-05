import { z } from "zod"

// ISO string that can be parsed by Date
const isoDateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Invalid date string" })

export const timestampJsonSchema = z.union([
  isoDateString,
  z.number(),
  z.date(),
  z.object({
    seconds: z.number(),
    nanoseconds: z.number(),
  }),
])

export type TimestampJson = z.infer<typeof timestampJsonSchema>
