import { Search } from "minista"

import "./block-search.css"

const BlockSearch = () => {
  return (
    <div className="block-search">
      <Search
        jsonPath="/assets/search.json"
        className="block-search"
        searchFieldClassName="block-search-field"
        searchListClassName="block-search-list"
      />
    </div>
  )
}

export default BlockSearch
