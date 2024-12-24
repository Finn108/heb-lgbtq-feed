import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'

// TODO: Consider only checking the first x characters
function containsHebrew(text: string): boolean {
  const hebrewRangeStart = 0x0590; // Start of Hebrew Unicode range
  const hebrewRangeEnd = 0x05FF;   // End of Hebrew Unicode range

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    if (charCode >= hebrewRangeStart && charCode <= hebrewRangeEnd) {
      return true;
    }
  }
  return false;
}

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return

    const ops = await getOpsByType(evt)
    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    const postsToCreate = ops.posts.creates
      .filter((create) => {
        // only Hebrew posts
        return containsHebrew(create.record.text)
      })
      .map((create) => {
        // map posts to a db row
        return {
          uri: create.uri,
          cid: create.cid,
          author: create.author,
          indexedAt: new Date().toISOString(),
        }
      })

    if (postsToDelete.length > 0) {
      await this.db
        .deleteFrom('post')
        .where('uri', 'in', postsToDelete)
        .execute()
    }
    if (postsToCreate.length > 0) {
      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }

    // This logs the text of every post off the firehose.
    /* for (const post of postsToCreate) {
      console.log(post)
    } */

  }
}
