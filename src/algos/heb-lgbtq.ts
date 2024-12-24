import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'

const relevantUsers = new Set<string>()
const nonRelevantUsers = new Set<string>()

// max 15 chars
export const shortname = 'heb-lgbtq'

// TODO: find a way to add variations of man+man / woman+woman (emojis are complex)
function arrayContainsPrideEmojis(inputs: string[]): boolean {
  const prideEmojis = ['🌈', '🏳️‍🌈', '🏳️‍⚧️', '⚧️'];
  const prideEmojiRegex = new RegExp([...prideEmojis].join('|'));

  return inputs.some(input => prideEmojiRegex.test(input));
}

export const handler = async (ctx: AppContext, params: QueryParams) => {
  console.log(`heb lgbtq request!`)
  let builder = ctx.db
    .selectFrom('post')
    .selectAll()
    .orderBy('indexedAt', 'desc')
    .orderBy('cid', 'desc')
    .limit(params.limit)

  if (params.cursor) {
    const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
    builder = builder.where('post.indexedAt', '<', timeStr)
  }
  const res = await builder.execute();

  const filteredRes = await Promise.all(
    res.map(async function (post) {
      if (relevantUsers.has(post.author)) {
        return post; // Keep the post
      } else if (nonRelevantUsers.has(post.author)) {
        return null; // Exclude the post
      }

      const { data } = await ctx.agent.getProfile({ actor: post.author });
      const { description = "", displayName = "" } = data;

      if (arrayContainsPrideEmojis([description, displayName])) {
        relevantUsers.add(post.author);
        return post;
      } else {
        nonRelevantUsers.add(post.author);
        return null; // Exclude the post
      }
    })
  );

  // Filter out null values to get the final result
  const finalFilteredRes = filteredRes.filter(post => post !== null);

  const feed = finalFilteredRes.map((row) => ({
    post: row.uri,
  }))

  let cursor: string | undefined
  const last = finalFilteredRes.at(-1)
  if (last) {
    cursor = new Date(last.indexedAt).getTime().toString(10)
  }

  return {
    cursor,
    feed,
  }
}
