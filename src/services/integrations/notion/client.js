const { Client } = require('@notionhq/client');

class NotionClient {
  constructor() {
    this.client = new Client({
      auth: process.env.NOTION_TOKEN,
    });
  }

  // Database query operations
  async queryDatabase(params) {
    try {
      const response = await this.client.databases.query(params);
      return response;
    } catch (error) {
      console.error('Notion database query error:', error);
      throw error;
    }
  }

  async queryDatabaseAll(params) {
    try {
      let allResults = [];
      let hasMore = true;
      let startCursor = null;

      while (hasMore) {
        const queryParams = {
          ...params,
          ...(startCursor && { start_cursor: startCursor })
        };

        const response = await this.client.databases.query(queryParams);
        allResults = allResults.concat(response.results);
        
        hasMore = response.has_more;
        startCursor = response.next_cursor;
      }

      return { results: allResults };
    } catch (error) {
      console.error('Notion database query all error:', error);
      throw error;
    }
  }

  // Page operations
  async createPage(params) {
    try {
      const response = await this.client.pages.create(params);
      return response;
    } catch (error) {
      console.error('Notion page creation error:', error);
      throw error;
    }
  }

  async updatePage(params) {
    try {
      const response = await this.client.pages.update(params);
      return response;
    } catch (error) {
      console.error('Notion page update error:', error);
      throw error;
    }
  }

  async retrievePage(pageId, filterProperties = null) {
    try {
      const params = { page_id: pageId };
      if (filterProperties) {
        params.filter_properties = filterProperties;
      }
      
      const response = await this.client.pages.retrieve(params);
      return response;
    } catch (error) {
      console.error('Notion page retrieval error:', error);
      throw error;
    }
  }

  // Database info operations
  async retrieveDatabase(databaseId) {
    try {
      const response = await this.client.databases.retrieve({
        database_id: databaseId
      });
      return response;
    } catch (error) {
      console.error('Notion database retrieval error:', error);
      throw error;
    }
  }

  // Utility methods for common query patterns
  async findByProperty(databaseId, property, value, operator = 'equals') {
    const filter = {
      property: property
    };

    // Handle different property types
    if (typeof value === 'string') {
      if (property.toLowerCase().includes('date')) {
        filter.date = { [operator]: value };
      } else {
        filter.rich_text = { [operator]: value };
      }
    } else if (typeof value === 'number') {
      filter.number = { [operator]: value };
    } else if (typeof value === 'boolean') {
      filter.checkbox = { equals: value };
    } else if (value && typeof value === 'object') {
      // For select properties
      filter.select = { [operator]: value };
    }

    return await this.queryDatabase({
      database_id: databaseId,
      filter
    });
  }

  async findByDateRange(databaseId, dateProperty, startDate, endDate) {
    return await this.queryDatabase({
      database_id: databaseId,
      filter: {
        and: [
          {
            property: dateProperty,
            date: { on_or_after: startDate }
          },
          {
            property: dateProperty,
            date: { on_or_before: endDate }
          }
        ]
      }
    });
  }

  async findWithMultipleFilters(databaseId, filters, operator = 'and') {
    return await this.queryDatabase({
      database_id: databaseId,
      filter: {
        [operator]: filters
      }
    });
  }

  // Sorting utilities
  async queryWithSort(databaseId, filter = null, sorts = [], pageSize = 100) {
    const params = {
      database_id: databaseId,
      page_size: pageSize
    };

    if (filter) {
      params.filter = filter;
    }

    if (sorts.length > 0) {
      params.sorts = sorts;
    }

    return await this.queryDatabase(params);
  }
}

module.exports = new NotionClient();