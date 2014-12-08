/// <reference path="../define.ts"/>
/// <reference path="data.db.ts"/>

/* MODEL */

module MODULE.MODEL.APP.DATA {
  
  export class Store<T> implements StoreInterface<T> {
    constructor(public DB: DatabaseInterface) {
    }

    name: string
    keyPath: string
    autoIncrement: boolean = true
    indexes: StoreIndexOptionInterface[] = []
    limit: number = 0

    protected buffer: T[] = []

    protected accessStore(success: (store: IDBObjectStore) => void, mode: string = 'readwrite'): void {
      try {
        var database: IDBDatabase = this.DB.database(),
            store: IDBObjectStore = database && database.transaction(this.name, mode).objectStore(this.name);
      } catch (err) {
      }

      if (store) {
        success(store);
      } else {
        this.DB.open().done(() => this.accessStore(success));
      }
    }

    protected accessCount(success: (count: number) => void): void
    protected accessCount(index: string, success: (count: number) => void): void
    protected accessCount(): void {
      var index: string = 'string' === typeof arguments[0] && arguments[0],
          success: (count: number) => void = arguments[index ? 1 : 0];
      this.accessStore((store) => {
        var req = index ? store.index(index).count() : store.count();
        req.onsuccess = function () { success.apply(this, [].slice.call(arguments, 1).concat(this.result)); };
      });
    }

    protected accessRecord(key: string, success: (event?: Event) => void, mode?: string): void {
      this.accessStore((store) => {
        store.get(key).onsuccess = success;
      }, mode);
    }

    protected accessCursor(index: string, range: IDBKeyRange, direction: string, success: (event?: Event) => void): void {
      this.accessStore(function (store) {
        var req: IDBRequest;
        if (direction && range) {
          req = store.index(index).openCursor(range, direction);
        } else if (range) {
          req = store.index(index).openCursor(range);
        } else {
          req = store.openCursor();
        }
        req.onsuccess = success;
      });
    }

    protected accessAll(success: (event?: Event) => void): void
    protected accessAll(index: string, range: IDBKeyRange, direction: string, success: (event?: Event) => void): void
    protected accessAll(index: any, range?: IDBKeyRange, direction?: string, success?: (event?: Event) => void): void {
      if ('function' === typeof index) {
        success = index;
        index = null;
        range = null;
        direction = null;
      }
      this.accessCursor(index, range, direction, success);
    }

    get(key: number, success: (event: Event) => void): void
    get(key: string, success: (event: Event) => void): void
    get(key: any, success: (event: Event) => void): void {
      this.accessRecord(key, success);
    }

    set(value: T, merge?: boolean): void {
      if (!merge) { return this.put(value); }

      value = jQuery.extend(true, {}, value);
      var key = value[this.keyPath];
      this.accessRecord(key, function () {
        this.source.put(jQuery.extend(true, {}, this.result, value));
      });
    }

    add(value: T): void {
      value = jQuery.extend(true, {}, value);
      var key = value[this.keyPath];
      if (this.autoIncrement) {
        delete value[this.keyPath];
      }
      this.accessStore(function (store) {
        store.add(value);
      });
    }

    put(value: T): void {
      value = jQuery.extend(true, {}, value);
      var key = value[this.keyPath];
      this.accessStore(function (store) {
        store.put(value);
      });
    }

    remove(key: number): void
    remove(key: string): void
    remove(key: any): void {
      this.accessStore(function (store) {
        store['delete'](key);
      });
    }

    clear(): void {
      this.accessStore(function (store) {
        store.clear();
      });
    }

    clean(): void {
      if (!this.limit || !this.indexes.length) { return; }

      var index: string = this.indexes[0].name,
          size = this.limit;
      this.accessCount(index, (count) => {
        if (count <= size) { return; }
        size = count - size;
        this.accessCursor(index, this.DB.IDBKeyRange.upperBound(Infinity), 'prev', function () {
          if (!this.result || !size--) { return; }

          var cursor: IDBCursorWithValue = this.result;
          cursor['delete']();
          cursor['continue']();
        });
      });
    }

    loadBuffer(limit: number = 0): void {
      var buffer = this.buffer;
      if (this.indexes.length) {
        this.DB.IDBKeyRange && 
        this.accessAll(this.indexes[0].name, this.DB.IDBKeyRange.upperBound(Infinity), 'prev', callback);
      } else {
        this.accessAll(callback);
      }
      function callback() {
        if (!this.result) { return; }
        var cursor: IDBCursorWithValue = this.result;

        buffer[cursor.primaryKey] = <T>cursor.value;

        --limit && cursor['continue']();
      }
    }

    saveBuffer(): void {
      var buffer = this.buffer;
      this.accessStore(function (store) {
        for (var i in buffer) {
          store.put(buffer[i]);
        }
      });
    }

    getBuffers(): T[] {
      return this.buffer;
    }

    setBuffers(values: T[], merge?: boolean): T[] {
      for (var i in values) {
        this.setBuffer(values[i], merge);
      }
      return this.buffer;
    }

    getBuffer(key: string): T
    getBuffer(key: number): T
    getBuffer(key: any): any {
      return this.buffer[key];
    }

    setBuffer(value: T, merge?: boolean): T {
      var key = value[this.keyPath];
      this.buffer[key] = !merge ? value : jQuery.extend(true, {}, this.buffer[key], value);
      return this.buffer[key];
    }

    addBuffer(value: T): T {
      value[this.keyPath] = this.buffer.length || 1;
      this.buffer.push(value);
      return value;
    }
    
    removeBuffer(key: string): T
    removeBuffer(key: number): T
    removeBuffer(key: any): T {
      var ret = this.buffer[key];
      if ('number' === typeof key && key >= 0 && key in this.buffer && this.buffer.length > key) {
        this.buffer.splice(key, 1);
      } else {
        delete this.buffer[key];
      }
      return ret;
    }

    clearBuffer(): void {
      this.buffer.splice(0, this.buffer.length);
    }
    
  }

}