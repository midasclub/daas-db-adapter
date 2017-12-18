import { GameMode, LobbyStatus, Server } from "@daas/model"

export interface UpdateLobbyData {
	name?: string
	password?: string
	server?: Server
	gameMode?: GameMode
	teamAHasFirstPick?: boolean
	status?: LobbyStatus
}