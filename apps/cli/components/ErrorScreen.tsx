import { Box, Text } from "ink"

interface ErrorScreenProps {
  error: Error
  onRetry: () => void
}

export function ErrorScreen({ error }: ErrorScreenProps) {
  return (
    <Box flexDirection="column" padding={1}>
      <Text color="red">✗ Error: {error.message}</Text>
      <Text dimColor>Press Ctrl+C to exit</Text>
    </Box>
  )
}
