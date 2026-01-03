/**
 * Split SQL text into individual statements, handling:
 * - Single quotes (strings)
 * - Double quotes (identifiers)
 * - Single-line comments (--)
 * - Block comments
 */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;
  
  while (i < sql.length) {
    const char = sql[i];
    const next = sql[i + 1];
    
    // Single-line comment
    if (char === '-' && next === '-') {
      const endOfLine = sql.indexOf('\n', i);
      if (endOfLine === -1) {
        current += sql.slice(i);
        break;
      }
      current += sql.slice(i, endOfLine + 1);
      i = endOfLine + 1;
      continue;
    }
    
    // Multi-line comment
    if (char === '/' && next === '*') {
      const endComment = sql.indexOf('*/', i + 2);
      if (endComment === -1) {
        current += sql.slice(i);
        break;
      }
      current += sql.slice(i, endComment + 2);
      i = endComment + 2;
      continue;
    }
    
    // Single-quoted string
    if (char === "'") {
      current += char;
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          // Escaped quote
          current += "''";
          i += 2;
        } else if (sql[i] === "'") {
          current += sql[i];
          i++;
          break;
        } else {
          current += sql[i];
          i++;
        }
      }
      continue;
    }
    
    // Double-quoted identifier
    if (char === '"') {
      current += char;
      i++;
      while (i < sql.length) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          // Escaped quote
          current += '""';
          i += 2;
        } else if (sql[i] === '"') {
          current += sql[i];
          i++;
          break;
        } else {
          current += sql[i];
          i++;
        }
      }
      continue;
    }
    
    // Statement separator
    if (char === ';') {
      const trimmed = current.trim();
      if (trimmed) {
        statements.push(trimmed);
      }
      current = '';
      i++;
      continue;
    }
    
    current += char;
    i++;
  }
  
  // Don't forget the last statement (may not have trailing semicolon)
  const trimmed = current.trim();
  if (trimmed) {
    statements.push(trimmed);
  }
  
  return statements;
}
