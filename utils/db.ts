// utils/db.ts

const DB_NAME = 'cortex-audio-cache';
const STORE_NAME = 'audioClips';
const DB_VERSION = 1;

let db: IDBDatabase | null = null;

// Inicializa o banco de dados IndexedDB.
// É chamado uma vez para configurar o banco de dados e o object store.
function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (db) {
      return resolve(db);
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('Erro ao abrir o IndexedDB:', event);
      reject('Erro no IndexedDB.');
    };

    request.onsuccess = (event) => {
      db = (event.target as IDBOpenDBRequest).result;
      resolve(db);
    };

    // Este evento só é acionado em novas versões do banco de dados.
    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

// Busca um clipe de áudio no cache pelo seu ID (chave).
export async function getAudio(id: string): Promise<string | undefined> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onerror = (event) => {
      console.error('Erro ao buscar áudio do cache:', event);
      reject('Falha ao buscar áudio.');
    };

    request.onsuccess = (event) => {
      const result = (event.target as IDBRequest).result;
      resolve(result ? result.audioData : undefined);
    };
  });
}

// Armazena um clipe de áudio (string base64) no cache.
export async function storeAudio(id: string, audioData: string): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({ id, audioData });

    request.onerror = (event) => {
      console.error('Erro ao armazenar áudio no cache:', event);
      reject('Falha ao armazenar áudio.');
    };

    request.onsuccess = () => {
      resolve();
    };
  });
}
