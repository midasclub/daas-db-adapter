import "mocha"
import { expect } from "chai"

import { Bot, BotStatus } from "@daas/model"
import { Bots } from "../../.."
import { assertRejects } from "../../util/assertRejects"

export function testBotProperties(bot: Bot) {
	expect(bot).to.be.instanceof(Bot)
	expect(bot.id).to.be.at.least(1)
	expect(bot.username).to.be.a("string")
	expect(bot.password).to.be.a("string")
}

export const botSuite = () =>
	describe("BotAdapter", async () => {
		describe("insert", () => {
			it("should insert a bot", async () => {
				const bot = await Bots.insert({
					username: "hello",
					password: "world",
					sentryFile: null
				})

				testBotProperties(bot)

				expect(bot.id).to.equal(1)
				expect(bot.username).to.equal("hello")
				expect(bot.password).to.equal("world")
				expect(bot.sentryFile).to.be.null
				expect(bot.status).to.equal(BotStatus.OFFLINE)
				expect(bot.disabledUntil).to.be.null
			})
			it("shouldn't insert a duplicate bot", async () => {
				await assertRejects(
					Bots.insert({
						username: "hello",
						password: "world",
						sentryFile: null
					})
				)
			})
		})
		describe("findAll", () => {
			it("should return all bots", async () => {
				await Promise.all([
					Bots.insert({
						username: "hello2",
						password: "world",
						sentryFile: null
					}),
					Bots.insert({
						username: "hello3",
						password: "world",
						sentryFile: null
					})
				])

				const bots = await Bots.findAll()

				expect(bots)
					.to.be.an("array")
					.that.has.length(3)
				bots.forEach(bot => expect(bot).to.be.instanceof(Bot))

				expect(bots[0].username).to.equal("hello")
				expect(bots[1].username).to.equal("hello2")
				expect(bots[2].username).to.equal("hello3")
			})
			it("should support limits and offsets", async () => {
				const bots = await Bots.findAll(1, 1)

				expect(bots)
					.to.be.an("array")
					.that.has.length(1)
				expect(bots[0]).to.be.instanceof(Bot)
				expect(bots[0].username).to.equal("hello2")
			})
		})
		describe("findAllByStatus", () => {
			before(async () => {
				await Bots.update((await Bots.findById(3))!, { status: BotStatus.IDLE })
			})
			it("should return all offline bots", async () => {
				const bots = await Bots.findAllByStatus(BotStatus.OFFLINE)
				expect(bots).to.have.length(2)
				expect(bots[0].username).to.equal("hello")
				expect(bots[1].username).to.equal("hello3")
			})
			it("should return all idle bots", async () => {
				const bots = await Bots.findAllByStatus(BotStatus.IDLE)
				expect(bots).to.have.length(1)
				expect(bots[0].username).to.equal("hello2")
			})
		})
		describe("findById", async () => {
			it("should find a specific bot", async () => {
				const bot = await Bots.findById(1)
				expect(bot).not.to.be.null
				expect(bot!.username).to.equal("hello")
			})
			it("should return null on non existing bots", async () => {
				expect(await Bots.findById(100)).to.be.null
			})
		})
		describe("update", async () => {
			it("should update a bot", async () => {
				const bot = await Bots.findById(1)
				expect(bot).not.to.be.null
				const updatedBot = await Bots.update(bot!, {
					password: "newpass",
					status: BotStatus.IN_LOBBY,
					disabledUntil: new Date(Date.now() + 10000)
				})
				expect(updatedBot.password).to.equal("newpass")
				// Make sure that the change is on DB and not just on memory
				expect((await Bots.findById(1))!.password).to.equal("newpass")
			})
		})
		describe("delete", async () => {
			it("should delete a bot", async () => {
				const bot = await Bots.findById(1)
				expect(bot).not.to.be.null
				await Bots.delete(bot!)
				expect(await Bots.findById(1)).to.be.null
			})
		})
	})
