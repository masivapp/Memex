import { EventEmitter } from 'events'
import {
    BackupBackend,
    BackupObject,
    BackupObjectLocation,
    ObjectChange,
} from './types'
import {
    separateDataFromImageChanges,
    shouldWriteImages,
} from 'src/backup/background/backend/utils'

export default class SimpleHttpBackend extends BackupBackend {
    private url

    constructor({ url }: { url: string }) {
        super()

        this.url = url
    }

    async isConnected() {
        return true
    }
    async isAuthenticated() {
        return true
    }

    async storeObject({
        backupObject,
        events,
    }: {
        backupObject: BackupObject
        events: EventEmitter
    }): Promise<any> {
        await this._writeToPath(
            `${backupObject.collection}/${encodeURIComponent(
                encodeURIComponent(backupObject.pk),
            )}`,
            JSON.stringify(backupObject.object),
        )
    }

    async _writeToPath(url: string, body: string) {
        await fetch(`${this.url}/${url}`, {
            method: 'PUT',
            body,
        })
    }

    async deleteObject({
        backupObject,
        events,
    }: {
        backupObject: BackupObjectLocation
        events: EventEmitter
    }): Promise<any> {
        throw new Error('Not yet implemented  :(')
    }

    async backupChanges({
        changes: unprocessedChanges,
        events,
        currentSchemaVersion,
        options,
    }: {
        changes: ObjectChange[]
        events: EventEmitter
        currentSchemaVersion: number
        options: { storeBlobs: boolean }
    }) {
        const stringify = obj => JSON.stringify(obj, null, 4)
        const { images, changes } = await separateDataFromImageChanges(
            unprocessedChanges,
        )

        const timestamp = Date.now()
        await this._writeToPath(
            `change-sets/${timestamp}`,
            stringify({ version: currentSchemaVersion, changes }),
        )

        if (shouldWriteImages(images, options.storeBlobs)) {
            await this._writeToPath(
                `images/${timestamp}`,
                stringify({ version: currentSchemaVersion, images }),
            )
        }
    }

    async listObjects(collection: string): Promise<string[]> {
        const response = await fetch(`${this.url}/${collection}`)
        if (response.status === 404) {
            return []
        }
        if (!response.ok) {
            throw new Error(await response.text())
        }

        const body = await response.text()
        const lines = body.split('\n')
        const matches = lines.map(line => /href="([^"]+)"/g.exec(line))
        const fileNames = matches
            .filter(match => !!match)
            .map(match => match[1])
        return fileNames
    }

    async retrieveObject(collection: string, object: string) {
        return (await fetch(`${this.url}/${collection}/${object}`)).json()
    }
}
