export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Kaja.io API",
    version: "1.0.0",
    description:
      "Simple manual OpenAPI reference for Kaja.io. For auth endpoints open the Swagger UI at /auth/reference."
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    }
  },
  tags: [{ name: "System" }, { name: "Auth" }, { name: "Users" }, { name: "Kaja Nodes" }, { name: "Kaja Jobs" }],
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
          401: { description: "Unauthorized" }
        }
      }
    },
    "/kaja/register-node": {
      post: {
        summary: "Register worker node",
        tags: ["Kaja Nodes"],
        responses: { 200: { description: "Node registered" } }
      }
    },
    "/kaja/heartbeat": {
      post: {
        summary: "Update node heartbeat",
        tags: ["Kaja Nodes"],
        responses: {
          200: { description: "Heartbeat accepted" },
          404: { description: "Unknown node" }
        }
      }
    },
    "/kaja/create-job": {
      post: {
        summary: "Create job",
        tags: ["Kaja Jobs"],
        responses: { 200: { description: "Job created" } }
      }
    },
    "/kaja/get-job": {
      post: {
        summary: "Claim next job",
        tags: ["Kaja Jobs"],
        responses: {
          200: { description: "Job payload" },
          204: { description: "No job available" },
          404: { description: "Unknown node" }
        }
      }
    },
    "/kaja/submit-result": {
      post: {
        summary: "Submit job result",
        tags: ["Kaja Jobs"],
        responses: {
          200: { description: "Result accepted" },
          404: { description: "Job not found" }
        }
      }
    }
  }
}
