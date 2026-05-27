export const openApiSpec = {
  openapi: "3.1.1",
  info: {
    title: "Kaja.io API",
    version: "0.0.1",
    description: "Custom endpoints without [auth reference](/auth/reference)."
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Retrieve the value from the `kaja.session_token` cookie."
      }
    },
    schemas: {
      ConnectNodeRequest: {
        type: "object",
        properties: {
          nodeId: { type: "string", format: "uuid", description: "Optional node ID (UUIDv7)" },
          name: { type: "string", description: "Node name", example: "andras-macbook" },
          ip: { type: "string", format: "ipv4", description: "Node IP address for geo location tracking" }
        },
        required: ["name"]
      },
      ConnectNodeResponse: {
        type: "object",
        properties: {
          nodeId: { type: "string", format: "uuid", description: "Server generated or confirmed node ID (UUIDv7)" },
          pollIntervalMs: { type: "integer", description: "Polling interval in milliseconds", example: 2000 }
        },
        required: ["nodeId", "pollIntervalMs"]
      },
      CommandResult: {
        type: "object",
        properties: {
          commandId: { type: "string", format: "uuid", description: "Command ID (UUIDv7)" },
          status: { type: "string", enum: ["completed", "failed", "timeout"] },
          result: { description: "Command result data" },
          error: { type: "string", description: "Error message if failed" },
          exitCode: { type: "integer", description: "Command exit code" }
        },
        required: ["commandId", "status"]
      },
      HeartbeatRequest: {
        type: "object",
        properties: {
          nodeId: { type: "string", format: "uuid", description: "Node ID (UUIDv7)" },
          status: { type: "string", enum: ["idle", "busy"], description: "Node status" },
          currentJobId: { type: "string", format: "uuid", description: "Current job ID if busy (UUIDv7)" },
          commandResults: {
            type: "array",
            items: { $ref: "#/components/schemas/CommandResult" },
            description: "Results from executed commands"
          }
        },
        required: ["nodeId", "status"]
      },
      PendingCommand: {
        type: "object",
        properties: {
          commandId: { type: "string", format: "uuid", description: "Command ID (UUIDv7)" },
          command: { type: "string", description: "Command to execute" },
          args: { type: "object", additionalProperties: true, description: "Command arguments" },
          timeoutSeconds: { type: "integer", default: 300, description: "Command timeout in seconds" }
        },
        required: ["commandId", "command"]
      },
      HeartbeatResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          pollIntervalMs: { type: "integer", description: "Next polling interval in milliseconds" },
          commands: {
            type: "array",
            items: { $ref: "#/components/schemas/PendingCommand" },
            description: "Pending commands to execute"
          }
        },
        required: ["ok"]
      },
      NodeListResponse: {
        type: "object",
        properties: {
          nodes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                name: { type: "string" },
                status: { type: "string", enum: ["idle", "busy", "inactive"] },
                lastSeen: { type: "string", format: "date-time" }
              }
            }
          }
        },
        required: ["nodes"]
      },
      CreateCommandRequest: {
        type: "object",
        properties: {
          command: { type: "string", minLength: 1, description: "Command to execute" },
          args: { type: "object", additionalProperties: true, description: "Command arguments" },
          timeoutSeconds: { type: "integer", minimum: 1, maximum: 3600, default: 300, description: "Timeout in seconds" }
        },
        required: ["command"]
      },
      Command: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          nodeId: { type: "string", format: "uuid" },
          command: { type: "string" },
          args: { type: "object", additionalProperties: true },
          timeoutSeconds: { type: "integer" },
          status: { type: "string", enum: ["pending", "executing", "completed", "failed", "timeout"] },
          createdAt: { type: "string", format: "date-time" },
          startedAt: { type: "string", format: "date-time" },
          completedAt: { type: "string", format: "date-time" },
          result: { description: "Command result data" },
          error: { type: "string" },
          exitCode: { type: "integer" },
          createdBy: { type: "string", format: "uuid" }
        },
        required: ["id", "nodeId", "command", "timeoutSeconds", "status", "createdAt"]
      },
      CommandsListResponse: {
        type: "object",
        properties: {
          commands: {
            type: "array",
            items: { $ref: "#/components/schemas/Command" }
          }
        },
        required: ["commands"]
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string" }
        },
        required: ["error"]
      }
    }
  },
  tags: [{ name: "System" }, { name: "Users" }, { name: "Kaja Nodes" }, { name: "Admin" }],
  paths: {
    "/health": {
      get: {
        summary: "API health check",
        tags: ["System"],
        responses: { 200: { description: "OK" } }
      }
    },
    "/users/me": {
      get: {
        summary: "Current user profile",
        tags: ["Users"],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Authenticated user" },
          401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }
        }
      }
    },
    "/kaja/connect": {
      post: {
        summary: "Connect a CLI node",
        description: "Register or reconnect a CLI node to the API",
        tags: ["Kaja Nodes"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ConnectNodeRequest" }
            }
          }
        },
        responses: {
          200: {
            description: "Node connected successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ConnectNodeResponse" }
              }
            }
          },
          401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }
        }
      }
    },
    "/kaja/heartbeat": {
      post: {
        summary: "Update node heartbeat",
        description: "Send heartbeat with node status and optionally receive pending commands",
        tags: ["Kaja Nodes"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/HeartbeatRequest" }
            }
          }
        },
        responses: {
          200: {
            description: "Heartbeat accepted",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HeartbeatResponse" }
              }
            }
          },
          401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          404: { description: "Unknown node", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }
        }
      }
    },
    "/kaja/nodes": {
      get: {
        summary: "List active nodes",
        description: "Get all active nodes for the authenticated user",
        tags: ["Kaja Nodes"],
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "List of active nodes",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/NodeListResponse" }
              }
            }
          },
          401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }
        }
      }
    },
    "/kaja/admin/nodes/{nodeId}/commands": {
      post: {
        summary: "Create a command for a node",
        description: "Queue a new command to be executed by the specified node",
        tags: ["Admin"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "nodeId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Node ID (UUIDv7)"
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateCommandRequest" }
            }
          }
        },
        responses: {
          201: {
            description: "Command created successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Command" }
              }
            }
          },
          401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          500: { description: "Failed to create command", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }
        }
      },
      get: {
        summary: "List all commands for a node",
        description: "Retrieve all commands associated with a specific node",
        tags: ["Admin"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "nodeId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Node ID (UUIDv7)"
          }
        ],
        responses: {
          200: {
            description: "List of commands",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CommandsListResponse" }
              }
            }
          },
          401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }
        }
      }
    },
    "/kaja/admin/commands/{commandId}": {
      get: {
        summary: "Get a specific command by ID",
        description: "Retrieve detailed information about a specific command",
        tags: ["Admin"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "commandId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Command ID (UUIDv7)"
          }
        ],
        responses: {
          200: {
            description: "Command details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Command" }
              }
            }
          },
          401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          404: { description: "Command not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }
        }
      }
    }
  }
}
