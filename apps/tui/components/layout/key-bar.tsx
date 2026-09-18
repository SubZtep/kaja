import { Box, Text } from "ink"

/**
 * Bottom-of-screen key bar, nano/Midnight-Commander style: a row of
 * `<key> <label>` pairs, the key in reverse video.
 */
export function KeyBar({ items }: Readonly<{ items: { key: string; label: string }[] }>) {
  return (
    <Box flexShrink={0} width="100%">
      {items.map(item => (
        <Box key={item.key} marginRight={2}>
          <Text backgroundColor="cyan" color="black">
            {item.key}
          </Text>
          <Text> {item.label}</Text>
        </Box>
      ))}
    </Box>
  )
}
