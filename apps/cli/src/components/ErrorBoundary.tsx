import { Text } from "ink"
import { Component } from "react"
import { logger } from "../lib/logger"

interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error) {
    logger.error({ error }, "ErrorBoundary caught error")
  }

  render() {
    if (this.state.error) {
      return (
        <Text color="red">
          {"\n"}
          <Text dimColor bold>
            ✗ Error:
          </Text>{" "}
          {this.state.error.message}
        </Text>
      )
    }

    return this.props.children
  }
}
