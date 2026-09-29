import { InputSignal, ModelSignal, Type } from '@angular/core';

/**
 * Unwraps Angular InputSignal and ModelSignal types to their primitive underlying values.
 */
type UnwrapSignal<T> = T extends InputSignal<infer V>
  ? V
  : T extends ModelSignal<infer V>
  ? V
  : T;

/**
 * Maps public inputs and properties of a component class, converting InputSignal<V> into V.
 */
export type ComponentProps<T> = T extends Type<infer C>
  ? {
      [K in keyof C]?: UnwrapSignal<C[K]>;
    }
  : never;
