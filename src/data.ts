import * as admin from 'firebase-admin';
import * as FirebaseFirestore from '@google-cloud/firestore';

let dataServiceImpl: DataService;

// Export data types here
export enum UpdateType {
    Create,
    Update,
    Delete,
}
  
export interface AbstractData {
    id: string;
    ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
}

export interface QueryOptions {
    limit?: number;
}

export class Update {
    public documentQuery: string;
    public type: UpdateType;
    public value?: any;

    constructor(documentQuery: string, type: UpdateType, value?: any) {
      this.documentQuery = documentQuery;
      this.type = type;
      if (type === UpdateType.Create || type === UpdateType.Update) {
        if(!value) {
            throw new Error('Created an Update of type Create or Update without providing a value.');
        }
        this.value = value;
      }
    }
}

export class DataService {
    private firestore: FirebaseFirestore.Firestore;
    static arrayUnion = admin.firestore.FieldValue.arrayUnion;
    static arrayRemove = admin.firestore.FieldValue.arrayRemove;

    static getInstance(firebaseCredentialsJson: string) {
        if(dataServiceImpl) return dataServiceImpl;
        dataServiceImpl = new DataService(firebaseCredentialsJson);
        return dataServiceImpl;
    }

    private constructor(firebaseCredentialsJson: string) {
        const credentials = JSON.parse(firebaseCredentialsJson);
        admin.initializeApp({
            credential: admin.credential.cert(credentials),
        });
        this.firestore = admin.firestore();
    }

    async getCollection<T>(documentQuery: string, query?: any, options: QueryOptions = {}) {
        const firestoreCollection = this.firestore.collection(documentQuery);
        // Base query
        let firebaseQuery = firestoreCollection as FirebaseFirestore.Query;

        if(query) {
            firebaseQuery = firebaseQuery.where(query.documentVal, '==', query.actualVal);
        }
        if(options.limit) {
            firebaseQuery = firebaseQuery.limit(options.limit);
        }
        const querySnapshot = await firebaseQuery.get();
        const values = querySnapshot.docs.map((queryDocumentSnapshot) => {
            return {
                ...(queryDocumentSnapshot.data() as T),
                ref: queryDocumentSnapshot.ref,
                id: queryDocumentSnapshot.id,
                rawData: (queryDocumentSnapshot.data() as T),
            };
        });
        return values;
    }

    async getCollectionAsMap<T>(documentQuery: string, query?: any, options?: QueryOptions) {
        const collection = await this.getCollection<T>(documentQuery, query, options);
        const collectionMap = new Map();
        for (const item of collection) {
            collectionMap.set(item.id, item);
        }
        return collectionMap;
    }

    async getDocument<T>(documentQuery: string): Promise<T> {
        const documentRef = this.firestore.doc(documentQuery);
        return (await documentRef.get()).data() as T;
    }

    async setDocument(documentQuery: string, data: any) {
        const documentRef = this.firestore.doc(documentQuery);
        await documentRef.set(data);
    }

    async updateDocument(documentQuery: string, data: any) {
        const documentRef = this.firestore.doc(documentQuery);
        await documentRef.update(data);
    }

    async deleteDocument(documentQuery: string) {
        const documentRef = this.firestore.doc(documentQuery);
        await documentRef.delete();
    }

    async batchUpdate(updates: Update[]) {
        const writeBatch = this.firestore.batch();
        for (const update of updates) {
            if (update.type === UpdateType.Update) {
            writeBatch.update(this.firestore.doc(update.documentQuery), update.value);
            } else if (update.type === UpdateType.Delete) {
            writeBatch.delete(this.firestore.doc(update.documentQuery));
            } else if (update.type === UpdateType.Create) {
            writeBatch.set(this.firestore.doc(update.documentQuery), update.value);
            }
        }
        await writeBatch.commit();
    }
}