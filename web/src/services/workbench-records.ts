import { localApi, type WorkbenchKind } from "@/services/local-api";

export function createWorkbenchRecordStore(kind: WorkbenchKind) {
    return {
        async setItem<T>(id: string, value: T) {
            await localApi.setWorkbenchRecord(kind, id, value);
            return value;
        },
        async removeItem(id: string) {
            await localApi.removeWorkbenchRecord(kind, id);
        },
        async clear() {
            await localApi.replaceWorkbenchRecords(kind, {});
        },
        async iterate<T, R>(iterator: (value: T, key: string, iterationNumber: number) => R) {
            const records = await localApi.workbenchRecords<T>(kind);
            let iteration = 1;
            for (const [key, value] of Object.entries(records)) {
                const result = iterator(value, key, iteration++);
                if (result !== undefined) return result;
            }
            return undefined;
        },
    };
}
