import { createHash } from "node:crypto";

const gramLengths = [2, 3];
const maximumNgrams = 2000;
const stopWords = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "of",
  "on",
  "the",
  "to",
  "with",
]);
const semanticAliases = new Map([
  ["diagram", ["flowchart", "chart"]],
  ["flowchart", ["diagram", "flow chart", "process diagram"]],
  ["create", ["draw", "make"]],
  ["illustrate", ["draw", "sketch"]],
  ["sketch", ["draw", "illustrate"]],
]);

function hashGram(value) {
  return createHash("sha256").update(value).digest().subarray(0, 8).toString("base64url");
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stem(token) {
  if (token.length > 5 && token.endsWith("ing")) {
    const root = token.slice(0, -3);
    if (root.length > 1 && root.at(-1) === root.at(-2)) {
      return root.slice(0, -1);
    }
    return root;
  }
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
}

function textTokens(value) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !stopWords.has(token))
    .map(stem);
}

function gramsForToken(token) {
  const grams = new Set();
  for (const length of gramLengths) {
    for (let index = 0; index <= token.length - length; index += 1) {
      grams.add(token.slice(index, index + length));
    }
  }
  if (token.length >= 4) {
    for (let index = 0; index < token.length; index += 1) {
      grams.add(`d:${token.slice(0, index)}${token.slice(index + 1)}`);
    }
  }
  return grams;
}

function gramsForText(value) {
  const grams = new Set();
  for (const token of textTokens(value)) {
    for (const gram of gramsForToken(token)) grams.add(gram);
  }
  const joined = normalizeText(value).replaceAll(" ", "");
  for (const gram of gramsForToken(joined)) grams.add(gram);
  return grams;
}

export function createSearchNgrams(fields) {
  const grams = new Set();
  for (const field of fields) {
    for (const gram of gramsForText(field)) {
      grams.add(hashGram(gram));
      if (grams.size >= maximumNgrams) return [...grams];
    }
  }
  return [...grams];
}

export function buildNoteSearchFields(note, ocrResult = null) {
  const fields = [
    note.title,
    note.subject,
    note.topic,
    note.unit,
    note.description,
    note.department,
    note.university,
    note.fileName,
    note.keywords,
    note.tags,
  ];
  for (const page of ocrResult?.pages ?? []) {
    fields.push(page.extractedText);
    fields.push(...(page.recognizedFormulas ?? []));
  }
  return fields
    .flat(Infinity)
    .filter((field) => typeof field === "string" && field.trim());
}

export function buildPyqSearchFields(pyq) {
  return [
    pyq.title,
    pyq.subject,
    pyq.description,
    pyq.university,
    pyq.college,
    pyq.department,
    pyq.course,
    pyq.examType,
    pyq.fileName,
    pyq.keywords,
    pyq.tags,
  ]
    .flat(Infinity)
    .filter((field) => typeof field === "string" && field.trim());
}

export function createSearchQuery(query) {
  const normalized = normalizeText(query);
  const tokens = textTokens(normalized);
  const expandedTokens = new Set(tokens);
  for (const token of tokens) {
    for (const alias of semanticAliases.get(token) ?? []) {
      for (const aliasToken of textTokens(alias)) expandedTokens.add(aliasToken);
    }
  }
  const ngrams = new Set(gramsForText(normalized));
  for (const token of expandedTokens) {
    for (const gram of gramsForToken(token)) ngrams.add(gram);
  }
  return {
    normalized,
    tokens,
    expandedTokens: [...expandedTokens],
    ngrams: [...ngrams].map(hashGram),
    tokenGrams: new Map(
      [...expandedTokens].map((token) => [
        token,
        {
          grams: [...gramsForToken(token)]
            .filter((gram) => !gram.startsWith("d:"))
            .map(hashGram),
          deletions: [...gramsForToken(token)]
            .filter((gram) => gram.startsWith("d:"))
            .map(hashGram),
        },
      ]),
    ),
  };
}

function damerauLevenshtein(left, right) {
  const matrix = Array.from({ length: left.length + 1 }, () =>
    Array(right.length + 1).fill(0),
  );
  for (let row = 0; row <= left.length; row += 1) matrix[row][0] = row;
  for (let column = 0; column <= right.length; column += 1) {
    matrix[0][column] = column;
  }
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost,
      );
      if (
        row > 1 &&
        column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        matrix[row][column] = Math.min(
          matrix[row][column],
          matrix[row - 2][column - 2] + 1,
        );
      }
    }
  }
  return matrix[left.length][right.length];
}

function matchToken(queryToken, resourceTokens, resourceNgrams, queryTokenGrams) {
  let best = 0;
  for (const resourceToken of resourceTokens) {
    if (queryToken === resourceToken) return 4;
    if (resourceToken.includes(queryToken) || queryToken.includes(resourceToken)) {
      if (Math.min(queryToken.length, resourceToken.length) >= 3) best = Math.max(best, 2);
    }
    const maximumDistance = queryToken.length >= 8 ? 2 : 1;
    if (
      queryToken.length >= 4 &&
      Math.abs(queryToken.length - resourceToken.length) <= maximumDistance &&
      damerauLevenshtein(queryToken, resourceToken) <= maximumDistance
    ) {
      best = Math.max(best, 3);
    }
  }
  if (best) return best;

  const queryGrams =
    queryTokenGrams?.grams ?? [...gramsForToken(queryToken)].map(hashGram);
  const queryDeletions = queryTokenGrams?.deletions ?? [];
  for (const deletion of queryDeletions) {
    if (resourceNgrams.has(deletion)) return 3;
  }
  let overlap = 0;
  for (const gram of queryGrams) {
    if (resourceNgrams.has(gram)) overlap += 1;
  }
  return queryGrams.length >= 3 && overlap / queryGrams.length >= 0.5 ? 2 : 0;
}

export function scoreResourceSearch(resource, query) {
  const fields = [
    resource.title,
    resource.subject,
    resource.topic,
    resource.unit,
    resource.description,
    resource.department,
    resource.university,
    resource.college,
    resource.course,
    resource.examType,
    resource.fileName,
  ];
  const normalizedFields = fields.map(normalizeText).filter(Boolean);
  const resourceTokens = new Set(normalizedFields.flatMap(textTokens));
  const resourceNgrams = new Set(resource.searchNgrams ?? []);
  const meaningfulTokens = query.tokens;
  if (!meaningfulTokens.length) return { rank: 0, score: 0 };

  const normalizedPhrase = query.normalized.replaceAll(" ", "");
  if (
    normalizedFields.some(
      (field) =>
        field === query.normalized ||
        field.replaceAll(" ", "") === normalizedPhrase,
    )
  ) {
    return { rank: 4, score: 100 };
  }

  const matches = meaningfulTokens.map((token) =>
    matchToken(
      token,
      resourceTokens,
      resourceNgrams,
      query.tokenGrams.get(token),
    ),
  );
  const matchedCount = matches.filter(Boolean).length;
  const matchRatio = matchedCount / meaningfulTokens.length;
  if (matchedCount === meaningfulTokens.length && matches.every((rank) => rank >= 3)) {
    return { rank: 3, score: 70 + matches.reduce((sum, rank) => sum + rank, 0) };
  }
  if (matchRatio >= (meaningfulTokens.length === 1 ? 1 : 0.75)) {
    return {
      rank: 2,
      score: 40 + Math.round(matchRatio * 20) + matches.reduce((sum, rank) => sum + rank, 0),
    };
  }

  const semanticMatches = query.expandedTokens.filter(
    (token) =>
      !meaningfulTokens.includes(token) &&
      matchToken(
        token,
        resourceTokens,
        resourceNgrams,
        query.tokenGrams.get(token),
      ),
  ).length;
  const semanticRatio =
    (matchedCount + semanticMatches) / Math.max(meaningfulTokens.length, query.expandedTokens.length);
  if (semanticMatches && semanticRatio >= 0.6) {
    return { rank: 1, score: 10 + Math.round(semanticRatio * 10) };
  }
  return { rank: 0, score: 0 };
}
