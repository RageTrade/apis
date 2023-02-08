/* eslint-disable @typescript-eslint/no-explicit-any */

type Maybe<T> = T | undefined

export function combineStatsData<A, B, Combined>(
  stats: [A[], B[]],
  groupByKey: keyof A & keyof B,
  combinator: (objs: [Maybe<A>, Maybe<B>]) => Combined
): Combined[]

export function combineStatsData<A, B, C, Combined>(
  stats: [A[], B[], C[]],
  groupByKey: keyof A & keyof B & keyof C,
  combinator: (objs: [Maybe<A>, Maybe<B>, Maybe<C>]) => Combined
): Combined[]

export function combineStatsData<A, B, C, D, Chart>(
  stats: [A[], B[], C[], D[]],
  groupByKey: keyof A & keyof B & keyof C & keyof D,
  combinator: (objs: [Maybe<A>, Maybe<B>, Maybe<C>, Maybe<D>]) => Chart
): Chart[]

export function combineStatsData<A, B, C, D, E, Combined>(
  stats: [A[], B[], C[], D[], E[]],
  groupByKey: keyof A & keyof B & keyof C & keyof D & keyof E,
  combinator: (objs: [Maybe<A>, Maybe<B>, Maybe<C>, Maybe<D>, Maybe<E>]) => Combined
): Combined[]

export function combineStatsData<A, B, C, D, E, F, Combined>(
  stats: [A[], B[], C[], D[], E[], F[]],
  groupByKey: keyof A & keyof B & keyof C & keyof D & keyof E & keyof F,
  combinator: (
    objs: [Maybe<A>, Maybe<B>, Maybe<C>, Maybe<D>, Maybe<E>, Maybe<F>]
  ) => Combined
): Combined[]

export function combineStatsData<A, B, C, D, E, F, G, Combined>(
  stats: [A[], B[], C[], D[], E[], F[], G[]],
  groupByKey: keyof A & keyof B & keyof C & keyof D & keyof E & keyof F & keyof G,
  combinator: (
    objs: [Maybe<A>, Maybe<B>, Maybe<C>, Maybe<D>, Maybe<E>, Maybe<F>, Maybe<G>]
  ) => Combined
): Combined[]

export function combineStatsData(stats: any[], groupByKey: any, combinator: any) {
  const combinedArray = []
  const groups: Set<number> = new Set()

  // Add all of the values for the groupBy property from both arrays to the set
  stats.forEach((stat) => {
    stat.forEach((obj: any) => groups.add(obj[groupByKey] as number))
  })

  // Iterate over the set of groups and create a new object for each group,
  // combining the data from both arrays
  for (const group of groups) {
    const objs = stats.map((stat) => stat.find((obj: any) => obj[groupByKey] === group))

    combinedArray.push(combinator(objs))
  }

  return combinedArray
}
