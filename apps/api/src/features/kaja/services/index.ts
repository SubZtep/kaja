import { db } from "../../../core/db"
import { CommandService } from "./command"
import { NodeService } from "./node"

export const nodeService = new NodeService(db)
export const commandService = new CommandService(db)
