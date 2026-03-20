import Dexie, { type Table } from 'dexie';
import { ProcessedDocument } from '../types';

// FIX: Re-structured Dexie setup to a functional approach to resolve a TypeScript error
// where methods from the parent Dexie class (like .version()) were not being recognized
// on the subclass. This pattern avoids subclassing and directly configures the Dexie instance,
// which is a more robust way to handle typings with Dexie.
export const db = new Dexie('LensAIDatabase') as Dexie & {
  // 'documents' is our table (object store).
  // Dexie.Table<DataType, PrimaryKeyType>
  // The second generic argument is the type of the primary key ('id' is a string).
  documents: Table<ProcessedDocument, string>;
};

db.version(1).stores({
  // Defines the table's schema. 'id' is the primary key.
  documents: 'id',
});
