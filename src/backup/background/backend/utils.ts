import * as AllRaven from 'raven-js'
import {
    ObjectChangeImages,
    ObjectChange,
} from 'src/backup/background/backend/types'
import encodeBlob from 'src/util/encode-blob'

// tslint:disable-next-line:variable-name
const Raven = AllRaven['default']

export async function separateDataFromImageChanges(changes: ObjectChange[]) {
    const images = []
    for (const change of changes) {
        const changeImages = await _prepareBackupChangeForStorage(change)
        for (const [imageType, imageData] of Object.entries(changeImages)) {
            images.push({
                collection: change.collection,
                pk: change.objectPk,
                type: imageType,
                data: imageData,
            })
        }
    }

    return { changes, images }
}

export function shouldWriteImages(images, storeBlobs: boolean): boolean {
    return storeBlobs && !!images.length
}

export async function _prepareBackupChangeForStorage(change: ObjectChange) {
    const images: Partial<ObjectChangeImages> = {}
    if (
        change.collection === 'pages' &&
        change.object != null &&
        change.object.screenshot != null
    ) {
        try {
            images.screenshot = await encodeBlob(change.object.screenshot)
        } catch (e) {
            Raven.captureException(e)
        }
        change.object.screenshot = undefined
    }

    if (
        change.collection === 'favIcons' &&
        change.object != null &&
        change.object.favIcon != null
    ) {
        try {
            change.object.favIcon = await encodeBlob(change.object.favIcon)
        } catch (e) {
            Raven.captureException(e)
        }
    }

    return images
}
