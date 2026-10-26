import { defineEventHandler } from 'h3'
import { getFirebaseAuth } from '../../firebase/admin'
import { reserveMerchantSearch, blockMerchantSearch } from '../../repositories/merchant-search'
import { createMerchantSearch } from '../../utils/merchant-search'
import { createMerchantSearchHandler } from '../../utils/merchant-search-handler'

const service = createMerchantSearch({ secret: () => process.env.LOGO_DEV_SECRET_KEY,
  reserve: reserveMerchantSearch, block: blockMerchantSearch, fetch: globalThis.fetch })

export default defineEventHandler(createMerchantSearchHandler({
  verify: token => getFirebaseAuth().verifyIdToken(token, true), search: service.search
}))
