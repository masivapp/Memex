import { FeatureStorage } from '../../search/storage'
import { PageList, PageListEntry } from './types'

export default class CustomListStorage extends FeatureStorage {
    static CUSTOM_LISTS_COLL = 'customLists'
    static LIST_ENTRIES_COLL = 'pageListEntries'

    constructor({ storageManager }) {
        super(storageManager)
        this.storageManager.registry.registerCollections({
            [CustomListStorage.CUSTOM_LISTS_COLL]: {
                version: new Date(2018, 6, 12),
                fields: {
                    id: { type: 'string', pk: true },
                    name: { type: 'string' },
                    isDeletable: { type: 'boolean' },
                    isNestable: { type: 'boolean' },
                    createdAt: { type: 'datetime' },
                },
                indices: [
                    { field: 'id', pk: true },
                    { field: 'name', unique: true },
                    { field: 'isDeletable' },
                    { field: 'isNestable' },
                    { field: 'createdAt' },
                ],
            },
            [CustomListStorage.LIST_ENTRIES_COLL]: {
                version: new Date(2018, 6, 12),
                fields: {
                    listId: { type: 'string' },
                    pageUrl: { type: 'string' },
                    fullUrl: { type: 'string' },
                    createdAt: { type: 'datetime' },
                },
                indices: [
                    { field: ['listId', 'pageUrl'], pk: true },
                    { field: 'listId' },
                    { field: 'pageUrl' },
                ],
            },
        })
    }

    /**
     * Takes the list as they come from Db and does some pre-processing before sending.
     *
     * @private
     * @param {PageList[]} lists
     * @param {PageListEntry[]} pageEntries
     * @returns {PageList[]}
     * @memberof CustomListStorage
     */
    private changeListsBeforeSending(
        lists: PageList[],
        pageEntries: PageListEntry[],
    ): PageList[] {
        const mappedLists = lists.map(list => {
            const page = pageEntries.find(({ listId }) => listId === list.id)
            delete list['_name_terms']
            return {
                ...list,
                // Set an empty pages array for manupulating in redux store.
                pages: [],
                active: Boolean(page),
            }
        })
        return mappedLists
    }

    // Return all the list in the DB
    //  TODO: Use pagination if required
    async fetchAllLists({
        query = {},
        opts = {},
    }: {
        query?: any
        opts?: any
    }) {
        const x = await this.storageManager
            .collection(CustomListStorage.CUSTOM_LISTS_COLL)
            .findObjects<PageList>(query, opts)
        return this.changeListsBeforeSending(x, [])
    }

    /**
     *  Fetch list By Id.
     *
     * @param {number} id
     * @returns
     * @memberof CustomListStorage
     */
    async fetchListById(id: number) {
        const list = await this.storageManager
            .collection(CustomListStorage.CUSTOM_LISTS_COLL)
            .findOneObject<PageList>({ id })

        if (!list) {
            return null
        }

        const pages = await this.storageManager
            .collection(CustomListStorage.LIST_ENTRIES_COLL)
            .findObjects<PageListEntry>({
                listId: list.id,
            })
        delete list['_name_terms']
        return {
            ...list,
            pages: pages.map(({ fullUrl }) => fullUrl),
        }
    }

    /**
     * Return all the pages associated with a list.
     * @param {Object} obj
     * @param {number} obj.listId
     * @returns
     * @memberof CustomListStorage
     */
    async fetchListPagesById({ listId }: { listId: number }) {
        return this.storageManager
            .collection(CustomListStorage.LIST_ENTRIES_COLL)
            .findObjects({ listId })
    }

    /**
     * Returns all the lists containing a certain page.
     *
     * @param {Object} obj
     * @param {string} obj.url
     * @returns
     * @memberof CustomListStorage
     */
    async fetchListPagesByUrl({ url }: { url: string }) {
        const pages = await this.storageManager
            .collection(CustomListStorage.LIST_ENTRIES_COLL)
            .findObjects<PageListEntry>({
                pageUrl: url,
            })
        const listIds = pages.map(({ listId }) => listId)
        const lists = await this.fetchAllLists({
            query: {
                id: { $in: listIds },
            },
        })
        return this.changeListsBeforeSending(lists, pages)
    }

    /**
     * Function to insert into the DB
     *
     * @param {Object} obj
     * @param {string} obj.name
     * @param {boolean} obj.isNestable
     * @param {boolean} obj.isDeletable
     * @returns
     * @memberof CustomListStorage
     */
    async insertCustomList({
        name,
        isDeletable = true,
        isNestable = true,
    }: {
        name: string
        isDeletable: boolean
        isNestable: boolean
    }) {
        const { object } = await this.storageManager
            .collection(CustomListStorage.CUSTOM_LISTS_COLL)
            .createObject({
                id: this._generateListId(),
                name,
                isDeletable,
                isNestable,
                createdAt: new Date(),
            })

        return object.id
    }

    _generateListId() {
        return Date.now()
    }

    /**
     * Updates list name
     *
     * @param {Object} obj
     * @param {number} obj.id
     * @param {string} obj.name
     * @returns
     * @memberof CustomListStorage
     */
    async updateListName({ id, name }: { id: number; name: string }) {
        return this.storageManager
            .collection(CustomListStorage.CUSTOM_LISTS_COLL)
            .updateOneObject(
                {
                    id,
                },
                {
                    $set: {
                        name,
                        createdAt: new Date(),
                    },
                },
            )
    }

    /**
     * Delete List from the DB.
     *
     * @param {Object} obj
     * @param {number} obj.id
     * @returns
     * @memberof CustomListStorage
     */
    async removeList({ id }: { id: number }) {
        const list = await this.storageManager
            .collection(CustomListStorage.CUSTOM_LISTS_COLL)
            .deleteOneObject({
                id,
            })
        // Delete All pages associated with that list also
        const pages = await this.storageManager
            .collection(CustomListStorage.LIST_ENTRIES_COLL)
            .deleteObjects({
                listId: id,
            })
        return { list, pages }
    }

    /**
     *  Adds mapping to lists and pages table.
     *
     * @param {Object} obj
     * @param {number} obj.listId
     * @param {pageUrl} obj.pageUrl
     * @param {fullUrl} obj.fullUrl
     * @memberof CustomListStorage
     */
    async insertPageToList({
        listId,
        pageUrl,
        fullUrl,
    }: {
        listId: number
        pageUrl: string
        fullUrl: string
    }) {
        // check if the list ID exists in the DB, if not cannot add.
        const idExists = Boolean(await this.fetchListById(listId))

        if (idExists) {
            return this.storageManager
                .collection(CustomListStorage.LIST_ENTRIES_COLL)
                .createObject({
                    listId,
                    pageUrl,
                    fullUrl,
                    createdAt: new Date(),
                })
        }
    }

    /**
     * Removes the page from list.
     *
     * @param {Object} obj
     * @param {number} obj.listId
     * @param {string} obj.pageUrl
     * @returns
     * @memberof CustomListStorage
     */
    async removePageFromList({
        listId,
        pageUrl,
    }: {
        listId: number
        pageUrl: string
    }) {
        return this.storageManager
            .collection(CustomListStorage.LIST_ENTRIES_COLL)
            .deleteObjects({
                listId,
                pageUrl,
            })
    }

    /**
     * Suggestions based on search in popup
     *
     * @param {Object} obj
     * @param {string} obj.name
     * @param {string} obj.url
     * @returns
     * @memberof CustomListStorage
     */
    async fetchListNameSuggestions({
        name,
        url,
    }: {
        name: string
        url: string
    }) {
        const suggestions = await this.storageManager
            .collection(CustomListStorage.CUSTOM_LISTS_COLL)
            .suggestObjects<string, number>(
                {
                    name,
                },
                {
                    includePks: true,
                    ignoreCase: ['name'],
                    limit: 5,
                },
            )
        const listIds = suggestions.map(({ pk }) => pk)

        const lists: PageList[] = suggestions.map(({ pk, suggestion }) => ({
            id: pk,
            name: suggestion,
        }))

        // Gets all the pages associated with all the lists.
        const pageEntries = await this.storageManager
            .collection(CustomListStorage.LIST_ENTRIES_COLL)
            .findObjects<PageListEntry>({
                listId: { $in: listIds },
                pageUrl: url,
            })

        // Final pre-processing before sending in the lists.
        return this.changeListsBeforeSending(lists, pageEntries)
    }

    /**
     *
     * @param {Object} obj
     * @param {string} obj.name
     * @returns {PageList}
     * @memberof CustomListStorage
     */
    async fetchListIgnoreCase({ name }: { name: string }) {
        return this.storageManager
            .collection(CustomListStorage.CUSTOM_LISTS_COLL)
            .findOneObject<PageList>(
                {
                    name,
                },
                {
                    ignoreCase: ['name'],
                },
            )
    }
}
