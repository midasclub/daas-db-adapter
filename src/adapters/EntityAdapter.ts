import { Entity } from "@daas/model"
import { QueryBuilder } from "knex"
import { objectToSnakeCase } from "../support/objectToSnakeCase"
import { objectToCamelCase } from "../support/objectToCamelCase"
import { Join } from "./interfaces/Join"
import { JoinType } from "./enums/JoinType"
import { JoinedData } from "./interfaces/JoinedData"
import { JoinedColumn } from "./interfaces/JoinedColumn"
import { Db } from "./types/db"
import { isTransaction } from "../support/isTransaction"
import { Query } from "./types/Query"

export abstract class EntityAdapter<T extends Entity> {
	protected abstract readonly dbTable: string
	protected abstract readonly dbColumns: Array<string>
	protected abstract readonly joins: Array<Join> = []

	protected readonly db: Db

	constructor(db: Db) {
		this.db = db
	}

	protected get allCurrentTableColumns() {
		return this.dbColumns.concat("id")
	}

	private get allColumns() {
		const thisTableColumns = this.allCurrentTableColumns.map(
			c => `${this.dbTable}.${c}`
		)

		const columnsToJoin = this.joins
			.map(join =>
				join.targetTableColumns.map(
					c => `${join.targetTable}.${c} as ${join.targetTable}__${c}`
				)
			)
			.reduce((prev, next) => [...prev, ...next], [])

		return [...thisTableColumns, ...columnsToJoin]
	}

	private withJoinsApplied(query: QueryBuilder): QueryBuilder {
		let newQuery = query.clone()

		this.joins.forEach(join => {
			switch (join.type) {
				case JoinType.LEFT:
					newQuery = newQuery.leftJoin(
						join.targetTable,
						`${join.originTable}.${join.originColumn}`,
						`${join.targetTable}.${join.targetColumn}`
					)
			}
		})

		return newQuery
	}

	protected abstract mapDbResultToClass(
		row: any,
		joins?: Array<JoinedData>,
		additionalData?: any
	): T

	protected async findByCondition(condition: any) {
		const rows = await this.execQuery(db => {
			let query = db
				.select(this.allColumns)
				.from(this.dbTable)
				.where(condition)

			query = this.withJoinsApplied(query)

			return query
		})

		if (rows.length === 0) {
			return null
		} else {
			return this.mapDbResultToClass(
				objectToCamelCase(EntityAdapter.getMainTableColumnsFromDbResult(rows)),
				EntityAdapter.getJoinedTableColumnsFromDbResult(rows).map(it => ({
					table: it.table,
					rows: it.rows.map(objectToCamelCase)
				}))
			)
		}
	}

	findById(id: number): Promise<T | null> {
		const condition = {} as any
		condition[`${this.dbTable}.id`] = id
		return this.findByCondition(condition)
	}

	async findAll(limit?: number, offset: number = 0): Promise<Array<T>> {
		const results = await this.execQuery(db => {
			let query = db.select(this.allCurrentTableColumns).from(this.dbTable)

			if (typeof limit !== "undefined") {
				query = query.limit(limit)
			}

			query = query.offset(offset)

			return query
		})

		return results.map(objectToCamelCase).map(it => this.mapDbResultToClass(it))
	}

	async insert(data: any, dataToReturn?: any): Promise<T> {
		const [id] = await this.execQuery(db =>
			db
				.insert(objectToSnakeCase(data))
				.into(this.dbTable)
				.returning("id")
		)

		data.id = id

		return this.mapDbResultToClass(objectToCamelCase(data), [], dataToReturn)
	}

	async update(entity: T, difference: any, dataToReturn?: any): Promise<T> {
		if (Object.keys(difference).length === 0) {
			return entity
		}

		const [updatedData] = await this.execQuery(db =>
			db
				.table(this.dbTable)
				.update(objectToSnakeCase(difference))
				.where({ id: entity.id })
				.returning(this.allCurrentTableColumns)
		)

		return this.mapDbResultToClass(
			objectToCamelCase(updatedData),
			[],
			dataToReturn
		)
	}

	async delete(entity: T): Promise<void> {
		await this.execQuery(db =>
			db
				.delete()
				.from(this.dbTable)
				.where({ id: entity.id })
		)
	}

	async commit(): Promise<void> {
		if (isTransaction(this.db)) {
			await this.db.commit()
		}
	}

	async rollback(e?: Error): Promise<void> {
		if (isTransaction(this.db)) {
			await this.db.rollback(e)
		}
	}

	protected async execQuery(query: Query): Promise<Array<any>> {
		try {
			return await query(this.db)
		} catch (e) {
			await this.rollback(e)
			throw e
		}
	}

	private static getMainTableColumnsFromDbResult(dbResult: Array<any>): any {
		const result = {} as any
		Object.keys(dbResult[0])
			// Keep the ones that are not joined columns
			.filter(it => EntityAdapter.getJoinedColumnTableAndName(it) === null)
			.forEach(it => (result[it] = dbResult[0][it]))

		return result
	}

	private static getJoinedTableColumnsFromDbResult(
		dbResult: Array<any>
	): Array<JoinedData> {
		const result: Array<JoinedData> = []

		dbResult
			.map((dbRow: any) => {
				const organizedRow: Array<{ table: string; columns: any }> = []
				const joinedColumns = Object.keys(dbRow)
					// Keep the ones that are joined columns
					.map(it => EntityAdapter.getJoinedColumnTableAndName(it))
					.filter(it => it) as Array<JoinedColumn>

				joinedColumns.forEach(({ table, column }) => {
					const dbValue = dbRow[`${table}__${column}`]
					const group = organizedRow.find(it => it.table === table)

					if (group) {
						group.columns[column] = dbValue
					} else {
						const columns = {} as any
						columns[column] = dbValue
						organizedRow.push({ table, columns })
					}
				})

				return (
					organizedRow
						// Filter out the groups where no records are present
						// for that given table. i.e:
						// lobby_id | lobby_name | player_steam_id | player_name
						//     1    |    test    |       null      |     null
						.filter(
							group =>
								!Object.keys(group.columns)
									// Map to an array with the values
									.map(it => group.columns[it])
									// Map to true if the value is null
									.map(it => it === null)
									// Reduce to true if everything is null
									// Reduce to false if any of them is not
									// null
									.reduce((a, b) => a && b, true)
						)
				)
			})
			.forEach(organizedRow => {
				organizedRow.forEach(group => {
					const join = result.find(it => it.table === group.table)

					if (join) {
						join.rows.push(group.columns)
					} else {
						result.push({
							table: group.table,
							rows: [group.columns]
						})
					}
				})
			})

		return result
	}

	private static getJoinedColumnTableAndName(
		dbResultColumn: string
	): JoinedColumn | null {
		const matches = dbResultColumn.match(/(.+)__(.+)/)
		if (matches) {
			return {
				table: matches[1],
				column: matches[2]
			}
		} else {
			return null
		}
	}
}
