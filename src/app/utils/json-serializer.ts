const STORAGE: unique symbol = Symbol('storage');

export type Type<T> = new (...args: Array<any>) => T;

/**
 * Configuration attached to each property field
 */
class PropertyConfig {
  // Property type (mandatory if property is an object)
  isArray?: boolean = false;
  type?: Type<any>;
  typeArgs?: any[];
  // Property name when de/serialized from/to JSON
  mapTo?: string;
  // disable (de)serialization of value
  serialize?: boolean = true;
  deserialize?: boolean = true;
}

/**
 * Configuration attached to object
 */
class Storage<T> {
  // collection of object properties configured for (de)serialization
  props: Record<string, PropertyConfig> = {};
}

// /**
//  * Object decorator
//  */
// export function JsonObject<T>(classConfig: ClassConfig<T> = new ClassConfig<T>) {
//   return function (constructor: any) {
//     const storage = getStorage(constructor, true);
//     storage.classConfig = classConfig;
//   }
// }

/**
 * Property decorator
 */
export function JsonProperty<T>(config?: PropertyConfig) {
  return function (target: any, propName: string) {
    const storage = getStorage(target.constructor, true);
    storage!.props[propName] = Object.assign(new PropertyConfig(), config);
  }
}

/**
 * Returns the optional storage associated to the given class (by its constructor)
 */
function getStorage(constructor: any, createIfMissing = false): Storage<any>|undefined {
  if (createIfMissing && constructor[STORAGE] === undefined) {
    constructor[STORAGE] = new Storage();
  }
  return constructor[STORAGE];
}

/**
 * Deserialize the given JSON object to real a class instance of the given type
 */
export function deserializeObject<T extends any>(jsonObj: any, typeOrInstance: Type<T>|T, ...typeArgs: any[]): T {

  // create an instance of the object to be returned
  const res: T = is_constructor(typeOrInstance) ? new (<any>typeOrInstance)(...typeArgs) : typeOrInstance;
  const props = getSerializableFields(res);

  // scan object props
  for (const [key, config] of Object.entries(props)) {
    if (!config.deserialize) continue;

    // test if property name has been mapped to another name
    const mappedName = config.mapTo ?? key;

    // what kind of value we expect?
    if (config.isArray) {
      (<any>res)[key] = jsonObj[mappedName].map((el:any) => deserializeObject(el, config.type, config.typeArgs));
    }
    else if (config.type) {
      (<any>res)[key] = deserializeObject(jsonObj[mappedName], config.type, config.typeArgs);
    }
    else {
      (<any>res)[key] = jsonObj[mappedName];
    }
  }

  return res;

}

/**
 * Return an object with only the properties marked for serialization.
 * If no property is marked, then return the original object (untouched).
 */
export function serializeObject(instance: any): any {

  const storage = getStorage(instance.constructor);
  if (!storage) return instance;

  const result: any = {};
  for (const [key, config] of Object.entries(storage.props)) {
    if (!config.serialize) continue;
    let value = instance[key];
    if (config.isArray) {
      value = value.map((el:any) => serializeObject(el));
    }
    else if (typeof value === 'object') {
      value = serializeObject(value);
    }
    result[config.mapTo ?? key] = value;
  }
  return result;

}

/**
 * Return the names of serializable properties of the given object.
 */
function getSerializableFields(instance: any): Record<string, PropertyConfig> {

  const storage = getStorage(instance.constructor);
  if (storage) {
    return storage.props;
  }
  else {
    const res: Record<string, PropertyConfig> = {};
    Object.getOwnPropertyNames(instance).forEach(key => res[key] = {});
    return res;
  }
}

function is_constructor(f:any) {
  try {
    Reflect.construct(String, [], f);
  } catch (e) {
    return false;
  }
  return true;
}