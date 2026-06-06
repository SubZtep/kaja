import { pool } from "../../../core/db"
import { CommandService } from "./command"
import { NodeService } from "./node"

export const nodeService = new NodeService(pool)
export const commandService = new CommandService(pool)
