import {Config} from "@daas/model"
import { getDb } from "../connect"
import { UpdateConfigData } from "./definitions/UpdateConfigData"
import { objectToCamelCase } from "../support/objectToCamelCase"
import { objectToSnakeCase } from "../support/objectToSnakeCase"

export const CONFIG_COLUMS = [
	"league_id"
]

export class ConfigAdapter {
	async get(): Promise<Config> {
		return await getDb()
			.select(CONFIG_COLUMS)
			.from("config")
			.then(it => objectToCamelCase(it[0]))
	}

	async update(diff: UpdateConfigData): Promise<void> {
		if (Object.keys(diff).length === 0) {
			return
		}

		await getDb()
			.table("config")
			.update(objectToSnakeCase(diff))
	}
}