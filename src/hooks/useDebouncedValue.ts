// src/hooks/useDebouncedValue.ts
import { useEffect, useState } from 'react';
 
export default function useDebouncedValue<T>(value: T, ms = 250) { 
  const [v, setV] = useState(value);
  useEffect(() => {
     const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
