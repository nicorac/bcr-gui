/**
 * Annotation to mark a property for (de)serialization
 */
export function Serialized(): (target: any, propertyKey: string) => void {
  return (target: any, propertyKey: string) => {
    // initialize exclusion list
    const proto = target.__proto__;
    if (proto.___serializedKeys === undefined) {
      proto.___serializedKeys = [];
    }
    proto.___serializedKeys.push(propertyKey);
  }
}

/**
 * For the given target returns the names of properties marked for (de)serialization
 */
export function GetPropertyNames(target: any): string[] {
  return target.__proto__.___serializedKeys ?? []
}

/**
 * Merge values in jsonContent with the given target,
 * considering only the properties marked with @JsonSerialize() annotation
 */
export function FromJSON(target: any, jsonContent: string) {
  const src = JSON.parse(jsonContent);
  try {
    const keys = GetPropertyNames(target);
    keys.forEach(key => {
      if (src.hasOwnProperty(key)) {
        target[key] = src[key];
      }
    })
  }
  catch (error) { }
}

/**
 * Serialize the given object to JSON,
 * considering only properties marked with @JsonSerialize() annotation
 */
export function ToJSON(value: any): string {
  let res:any = {};
  const keys = GetPropertyNames(value);
  keys.forEach(key => {
    res[key] = value[key];
  });
  return JSON.stringify(res);
}
