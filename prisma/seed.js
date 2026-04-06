const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database with Dram & Draught locations...');

  // Create Dram & Draught locations
  const locations = [
    {
      name: 'Greensboro', slug: 'greensboro', city: 'Greensboro', state: 'NC',
      address: '300 West Gate City Blvd', zipCode: '27406', phone: '', email: 'greensboro@dramanddraught.com',
      specialText: '300+ Whiskeys | Craft Cocktails | NC Beers',
      hours: { monday: '4:00 PM - 12:00 AM', tuesday: '4:00 PM - 12:00 AM', wednesday: '4:00 PM - 12:00 AM', thursday: '4:00 PM - 2:00 AM', friday: '4:00 PM - 2:00 AM', saturday: '12:00 PM - 2:00 AM', sunday: '12:00 PM - 12:00 AM' },
      features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Indoor & Outdoor Seating'],
      facebook: 'https://facebook.com/DramandDraughtGreensboro', instagram: 'https://instagram.com/dramanddraught',
      menuUrl: 'https://www.dramanddraught.com/menus/', isActive: true
    },
    {
      name: 'Raleigh', slug: 'raleigh', city: 'Raleigh', state: 'NC',
      address: '1 Glenwood Avenue, Suite 101', zipCode: '27603', phone: '', email: 'raleigh@dramanddraught.com',
      specialText: 'Glenwood South Location | Happy Hour Daily',
      hours: { monday: '3:00 PM - 2:00 AM', tuesday: '3:00 PM - 2:00 AM', wednesday: '3:00 PM - 2:00 AM', thursday: '3:00 PM - 2:00 AM', friday: '3:00 PM - 2:00 AM', saturday: '12:00 PM - 2:00 AM', sunday: '12:00 PM - 12:00 AM' },
      features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Late Night'],
      instagram: 'https://instagram.com/dramanddraught', facebook: 'https://facebook.com/DramandDraughtRaleigh',
      menuUrl: 'https://www.dramanddraught.com/menus/', isActive: true
    },
    {
      name: 'Durham', slug: 'durham', city: 'Durham', state: 'NC',
      address: '701 W. Main Street Suite 123', zipCode: '27701', phone: '', email: 'durham@dramanddraught.com',
      specialText: 'Downtown Durham | Brightleaf Square',
      hours: { monday: '3:00 PM - 12:00 AM', tuesday: '3:00 PM - 12:00 AM', wednesday: '3:00 PM - 12:00 AM', thursday: '3:00 PM - 12:00 AM', friday: '3:00 PM - 2:00 AM', saturday: '12:00 PM - 2:00 AM', sunday: '12:00 PM - 12:00 AM' },
      features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Historic Location'],
      facebook: 'https://facebook.com/DramandDraughtDurham', instagram: 'https://instagram.com/dramanddraught',
      menuUrl: 'https://www.dramanddraught.com/menus/', isActive: true
    },
    {
      name: 'Winston-Salem', slug: 'winston-salem', city: 'Winston-Salem', state: 'NC',
      address: '486 North Patterson Avenue STE 120', zipCode: '27101', phone: '', email: 'winston@dramanddraught.com',
      specialText: 'Innovation Quarter | Indoor & Outdoor Seating',
      hours: { monday: '3:00 PM - 12:00 AM', tuesday: '3:00 PM - 12:00 AM', wednesday: '3:00 PM - 12:00 AM', thursday: '3:00 PM - 2:00 AM', friday: '3:00 PM - 2:00 AM', saturday: '12:00 PM - 2:00 AM', sunday: '12:00 PM - 12:00 AM' },
      features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Outdoor Patio'],
      facebook: 'https://facebook.com/DramandDraughtWinston', instagram: 'https://instagram.com/dramanddraughtwinston',
      menuUrl: 'https://www.dramanddraught.com/menus/', isActive: true
    },
    {
      name: 'Cary', slug: 'cary', city: 'Cary', state: 'NC',
      address: '3 Fenton Main St', zipCode: '27511', phone: '', email: 'cary@dramanddraught.com',
      specialText: 'Fenton Development | Extended Weekend Hours',
      hours: { monday: '4:00 PM - 12:00 AM', tuesday: '12:00 PM - 12:00 AM', wednesday: '12:00 PM - 12:00 AM', thursday: '12:00 PM - 12:00 AM', friday: '12:00 PM - 2:00 AM', saturday: '12:00 PM - 2:00 AM', sunday: '12:00 PM - 11:00 PM' },
      features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Family Friendly'],
      facebook: 'https://facebook.com/DramandDraughtCary', instagram: 'https://instagram.com/dramanddraught',
      menuUrl: 'https://www.dramanddraught.com/menus/', isActive: true
    },
    {
      name: 'Charlotte', slug: 'charlotte', city: 'Charlotte', state: 'NC',
      address: '1220 S Tryon St', zipCode: '28203', phone: '', email: 'charlotte@dramanddraught.com',
      specialText: 'South End Location | Open Late',
      hours: { monday: '3:00 PM - 2:00 AM', tuesday: '3:00 PM - 2:00 AM', wednesday: '3:00 PM - 2:00 AM', thursday: '3:00 PM - 2:00 AM', friday: '3:00 PM - 2:00 AM', saturday: '12:00 PM - 2:00 AM', sunday: '12:00 PM - 12:00 AM' },
      features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Late Night', 'South End'],
      facebook: 'https://facebook.com/DramandDraughtCLT', instagram: 'https://instagram.com/dramanddraught',
      menuUrl: 'https://www.dramanddraught.com/menus/', isActive: true
    },
    {
      name: 'Wilmington', slug: 'wilmington', city: 'Wilmington', state: 'NC',
      address: '109 Market St', zipCode: '28401', phone: '', email: 'wilmington@dramanddraught.com',
      specialText: 'Historic Downtown | Steps from Riverwalk',
      hours: { monday: '2:00 PM - 12:00 AM', tuesday: '2:00 PM - 12:00 AM', wednesday: '2:00 PM - 12:00 AM', thursday: '2:00 PM - 12:00 AM', friday: '12:00 PM - 2:00 AM', saturday: '12:00 PM - 2:00 AM', sunday: '12:00 PM - 12:00 AM' },
      features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Historic Downtown', 'Near Riverwalk'],
      facebook: 'https://facebook.com/DramandDraughtWilmington', instagram: 'https://instagram.com/dramanddraught',
      menuUrl: 'https://www.dramanddraught.com/menus/', isActive: true
    }
  ];

  // Upsert locations (non-destructive)
  for (const location of locations) {
    await prisma.location.upsert({
      where: { slug: location.slug },
      update: { name: location.name, city: location.city, state: location.state, address: location.address, zipCode: location.zipCode, phone: location.phone, email: location.email, specialText: location.specialText, hours: location.hours, features: location.features, isActive: true },
      create: location,
    });
    console.log(`Upserted location: ${location.name}`);
  }

  // ─── Seed Day Themes (company defaults, locationId: null) ───
  console.log('\nSeeding daily specials themes...');

  const dayThemes = [
    {
      dayOfWeek: 'MONDAY',
      name: 'Industry Night',
      tagline: 'Great prices for everyone',
      specials: [
        { name: 'Beer, Wine & THC', price: '25% off', category: 'beer', displayOrder: 0, section: '$8 Cocktails', timeWindow: 'All night' },
        { name: 'Daiquiri', price: '$8', category: 'cocktail', displayOrder: 1, section: '$8 Cocktails', description: 'Rum, lime, simple syrup' },
        { name: 'Old Fashioned', price: '$8', category: 'cocktail', displayOrder: 2, section: '$8 Cocktails', description: 'Bourbon, bitters, demerara' },
        { name: 'Fernet / Malort', price: '$5', category: 'other', displayOrder: 3, section: '$5 Shots & More' },
        { name: 'Snaquiris', price: '$5', category: 'cocktail', displayOrder: 4, section: '$5 Shots & More', description: 'Frozen daiquiri shots', badges: 'Staff Pick', isFeatured: true },
        { name: 'Pineapple UpDowns', price: '$5', category: 'cocktail', displayOrder: 5, section: '$5 Shots & More', description: 'Pineapple juice & Jameson' },
        { name: 'M&Ms', price: '$5', category: 'other', displayOrder: 6, section: '$5 Shots & More', description: 'Frangelico & Amaretto' },
      ]
    },
    {
      dayOfWeek: 'TUESDAY',
      name: 'Classic Tuesday',
      tagline: 'The classics, done right',
      description: 'All classics are $9 each',
      specials: [
        { name: 'Gold Rush', price: '$9', category: 'cocktail', displayOrder: 0, section: 'Featured Classics', description: 'Old Forrester Signature, Lemon, Honey', detailText: 'Whiskey Citrus Shaken' },
        { name: 'Penicillin', price: '$9', category: 'cocktail', displayOrder: 1, section: 'Featured Classics', description: 'Famous Grouse, Lemon, Honey, Ginger, Absinthe Spritz', detailText: 'Scotch Citrus Shaken' },
        { name: 'Negroni', price: '$9', category: 'cocktail', displayOrder: 2, section: 'Featured Classics', description: "Gordon's Gin, Campari, Cocchi Di Torino", detailText: 'Gin Bitter Stirred' },
        { name: 'Mai Tai', price: '$9', category: 'cocktail', displayOrder: 3, section: 'Featured Classics', description: 'Plantation Dark, Don Q Rum, Triple Sec, Lime, Orgeat', detailText: 'Rum Citrus Shaken' },
        { name: 'Manhattan', price: '$9', category: 'cocktail', displayOrder: 4, section: 'Featured Classics', description: 'Rittenhouse Bonded Rye, Cocchi Di Torino, Angostura', detailText: 'Whiskey Aromatic Stirred' },

        { name: 'Old Fashioned', price: '$9', category: 'cocktail', displayOrder: 5, section: 'Whiskey Classics', description: 'Old Forester 86, Brown Sugar, Angostura Bitters', detailText: 'Whiskey Spirit-Forward Stirred' },
        { name: 'Whiskey Sour', price: '$9', category: 'cocktail', displayOrder: 6, section: 'Whiskey Classics', description: 'Rittenhouse Bonded Rye, Lemon, Sugar, Egg-White', detailText: 'Whiskey Citrus Shaken' },
        { name: 'Mint Julep', price: '$9', category: 'cocktail', displayOrder: 7, section: 'Whiskey Classics', description: 'Old Forester 86, Mint, Sugar', detailText: 'Whiskey Herbal Built' },
        { name: 'Sazerac', price: '$9', category: 'cocktail', displayOrder: 8, section: 'Whiskey Classics', description: "Rittenhouse Bonded Rye, Brandy, Demerara Sugar, Peychaud's, Absinthe Rinse", detailText: 'Rye Aromatic Stirred' },
        { name: 'Boulevardier', price: '$9', category: 'cocktail', displayOrder: 9, section: 'Whiskey Classics', description: 'Old Forester 100, Campari, Cocchi Di Torino', detailText: 'Bourbon Bitter Stirred' },
        { name: 'Vieux Carré', price: '$9', category: 'cocktail', displayOrder: 10, section: 'Whiskey Classics', description: 'Rittenhouse Bonded Rye, Brandy, Benedictine, Cocchi Di Torino, Bitters', detailText: 'Rye & Brandy Complex Stirred' },
        { name: 'Toronto', price: '$9', category: 'cocktail', displayOrder: 11, section: 'Whiskey Classics', description: 'Rye Whiskey, Fernet Branca, Sugar, Angostura Bitters', detailText: 'Rye Herbal Stirred' },
        { name: 'Seelbach', price: '$9', category: 'cocktail', displayOrder: 12, section: 'Whiskey Classics', description: "Bourbon, Orange Curaçao, Angostura Bitters, Peychaud's Bitters, Prosecco", detailText: 'Bourbon Sparkling Built' },

        { name: 'Martini', price: '$9', category: 'cocktail', displayOrder: 13, section: 'Gin Classics', description: "Gordon's Gin, Dry Vermouth, Orange Bitters", detailText: 'Gin Elegant Stirred' },
        { name: 'Tom Collins', price: '$9', category: 'cocktail', displayOrder: 14, section: 'Gin Classics', description: "Gordon's Gin, Lemon, Sugar, Soda Water", detailText: 'Gin Citrus Built' },
        { name: 'Gimlet', price: '$9', category: 'cocktail', displayOrder: 15, section: 'Gin Classics', description: "Gordon's Gin, Lime, Sugar", detailText: 'Gin Citrus Shaken' },
        { name: 'French 75', price: '$9', category: 'cocktail', displayOrder: 16, section: 'Gin Classics', description: "Gordon's Gin, Lemon, Sugar, Prosecco", detailText: 'Gin Sparkling Shaken & Topped' },
        { name: 'Southside', price: '$9', category: 'cocktail', displayOrder: 17, section: 'Gin Classics', description: "Gordon's Gin, Lemon, Sugar, Mint", detailText: 'Gin Herbal Shaken' },
        { name: 'Vieux Mot', price: '$9', category: 'cocktail', displayOrder: 18, section: 'Gin Classics', description: 'Gin, St. Germain, Lemon, Sugar', detailText: 'Gin Floral Shaken' },
        { name: 'Hanky Panky', price: '$9', category: 'cocktail', displayOrder: 19, section: 'Gin Classics', description: 'Gin, Sweet Vermouth, Fernet Branca', detailText: 'Gin Herbal Stirred' },
        { name: 'Casino', price: '$9', category: 'cocktail', displayOrder: 20, section: 'Gin Classics', description: 'Gin, Maraschino, Lemon, Orange Bitters', detailText: 'Gin Bright Shaken' },
        { name: 'Army & Navy', price: '$9', category: 'cocktail', displayOrder: 21, section: 'Gin Classics', description: 'Gin, Lemon, Orgeat', detailText: 'Gin Nutty Shaken' },

        { name: 'Daiquiri', price: '$9', category: 'cocktail', displayOrder: 22, section: 'Rum Classics', description: 'Don Q Rum, Lime, Sugar', detailText: 'Rum Citrus Shaken' },
        { name: 'Mojito', price: '$9', category: 'cocktail', displayOrder: 23, section: 'Rum Classics', description: 'White Rum, Lime, Sugar, Mint, Soda Water', detailText: 'Rum Refreshing Built' },
        { name: "Dark 'N Stormy", price: '$9', category: 'cocktail', displayOrder: 24, section: 'Rum Classics', description: 'Goslings Rum, Lime, Ginger Beer', detailText: 'Rum Spicy Built' },
        { name: 'Jungle Bird', price: '$9', category: 'cocktail', displayOrder: 25, section: 'Rum Classics', description: 'Smith & Cross Rum, Campari, Pineapple, Lime, Demerara Sugar', detailText: 'Rum Tropical Shaken' },
        { name: 'El Presidente', price: '$9', category: 'cocktail', displayOrder: 26, section: 'Rum Classics', description: 'Rum, Blanc Vermouth, Curaçao, Grenadine', detailText: 'Rum Elegant Stirred' },
        { name: 'Royal Bermuda Yacht Club', price: '$9', category: 'cocktail', displayOrder: 27, section: 'Rum Classics', description: 'Rum, Falernum, Orange Curaçao, Lime', detailText: 'Rum Tropical Shaken' },

        { name: 'Margarita', price: '$9', category: 'cocktail', displayOrder: 28, section: 'Tequila Classics', description: 'Exotico Blanco, Lime, Orange Curaçao, Agave', detailText: 'Tequila Citrus Shaken' },
        { name: 'Paloma', price: '$9', category: 'cocktail', displayOrder: 29, section: 'Tequila Classics', description: 'Exotico Blanco, Lime, Grapefruit, Agave, Soda', detailText: 'Tequila Refreshing Built' },

        { name: 'Sidecar', price: '$9', category: 'cocktail', displayOrder: 30, section: 'Brandy Classics', description: 'Brandy, orange curaçao, Lemon', detailText: 'Brandy Citrus Shaken' },
        { name: "Jack Rose", price: '$9', category: 'cocktail', displayOrder: 31, section: 'Brandy Classics', description: "Laird's Apple Brandy, Lemon, Grenadine", detailText: 'Apple Brandy Fruity Shaken' },
        { name: 'Brandy Crusta', price: '$9', category: 'cocktail', displayOrder: 32, section: 'Brandy Classics', description: 'E&J Brandy, Orange Curaçao, Lemon, Maraschino, Bitters', detailText: 'Brandy Complex Shaken' },

        { name: 'Cosmopolitan', price: '$9', category: 'cocktail', displayOrder: 33, section: 'Vodka Classics', description: 'Vodka, Orange Curaçao, Lime, Cranberry', detailText: 'Vodka Fruity Shaken' },
        { name: 'Moscow Mule', price: '$9', category: 'cocktail', displayOrder: 34, section: 'Vodka Classics', description: 'Vodka, Lime, Ginger Beer', detailText: 'Vodka Spicy Built' },
        { name: 'Lemon Drop', price: '$9', category: 'cocktail', displayOrder: 35, section: 'Vodka Classics', description: 'Vodka, Lemon, Triple Sec, Sugar', detailText: 'Vodka Citrus Shaken' },

        { name: 'Aperol Spritz', price: '$9', category: 'cocktail', displayOrder: 36, section: 'Other Classics', description: 'Aperol, Prosecco, Soda Water', detailText: 'Aperitif Sparkling Built' },
        { name: 'Amaretto Sour', price: '$9', category: 'cocktail', displayOrder: 37, section: 'Other Classics', description: 'Amaretto, Bourbon, Lemon, Sugar, Egg White', detailText: 'Liqueur Nutty Shaken' },
        { name: 'Caipirinha', price: '$9', category: 'cocktail', displayOrder: 38, section: 'Other Classics', description: 'Cachaça, Lime, Sugar', detailText: 'Cachaça Citrus Muddled' },
        { name: "Pimm's Cup", price: '$9', category: 'cocktail', displayOrder: 39, section: 'Other Classics', description: "Pimm's No.1, Lemon, Cucumber, Mint, Ginger Ale", detailText: 'Liqueur Refreshing Built' },
      ]
    },
    {
      dayOfWeek: 'WEDNESDAY',
      name: 'Whiskey Wednesday',
      tagline: 'Expand your palate',
      specials: [
        { name: 'Old Fashioned', price: '$10', category: 'cocktail', displayOrder: 0, section: '$10 Whiskey Cocktails', description: 'Bourbon, bitters, demerara', isFeatured: true },
        { name: 'Manhattan', price: '$10', category: 'cocktail', displayOrder: 1, section: '$10 Whiskey Cocktails', description: 'Rye, sweet vermouth, Angostura' },
        { name: 'Gold Rush', price: '$10', category: 'cocktail', displayOrder: 2, section: '$10 Whiskey Cocktails', description: 'Bourbon, honey syrup, fresh lemon' },
        { name: 'Revolver', price: '$10', category: 'cocktail', displayOrder: 3, section: '$10 Whiskey Cocktails', description: 'Bourbon, coffee liqueur, orange bitters', badges: 'This Month Only' },
      ]
    },
    {
      dayOfWeek: 'THURSDAY',
      name: 'Agave After Hours',
      tagline: 'Tequila & mezcal take center stage',
      specials: [
        { name: 'Margarita', price: '$10', category: 'cocktail', displayOrder: 0, section: '$10 Agave Cocktails', description: 'Tequila, Cointreau, fresh lime' },
        { name: 'Spicy Margarita', price: '$10', category: 'cocktail', displayOrder: 1, section: '$10 Agave Cocktails', description: 'Tequila, jalapeño, Cointreau, lime', badges: 'Staff Pick', isFeatured: true },
        { name: 'Paloma', price: '$10', category: 'cocktail', displayOrder: 2, section: '$10 Agave Cocktails', description: 'Tequila, grapefruit, lime, soda' },
        { name: 'Oaxaca Old Fashioned', price: '$10', category: 'cocktail', displayOrder: 3, section: '$10 Agave Cocktails', description: 'Mezcal, tequila, agave, mole bitters' },
      ]
    },
    {
      dayOfWeek: 'FRIDAY',
      name: 'Flight Night',
      tagline: 'Taste something new',
      description: '',
      specials: [
        { name: 'Themed Spirit Flight', description: 'Rotating monthly — 3 curated pours with tasting notes', category: 'whiskey', displayOrder: 0, detailText: 'Each flight comes with a tasting card so you can learn as you sip. Ask your bartender about this month\'s theme.' },
      ]
    },
    {
      dayOfWeek: 'SATURDAY',
      name: "Bartender's Focus",
      tagline: 'Full menu, no specials',
      description: 'Saturday is our bartenders\' night to shine. Full menu available — ask for their recommendations.',
      specials: []
    },
    {
      dayOfWeek: 'SUNDAY',
      name: 'Break Even Bottles',
      tagline: 'Select bottles sold at cost',
      description: 'Featured bottles at our cost — our gift to you to close out the week.',
      specials: []
    },
  ];

  for (const dt of dayThemes) {
    const { specials, ...themeData } = dt;
    // Prisma can't upsert on composite unique with null, so findFirst + create/update
    let theme = await prisma.dayTheme.findFirst({ where: { dayOfWeek: dt.dayOfWeek, locationId: null } });
    if (theme) {
      theme = await prisma.dayTheme.update({ where: { id: theme.id }, data: { name: themeData.name, tagline: themeData.tagline, description: themeData.description, isActive: true } });
    } else {
      theme = await prisma.dayTheme.create({ data: { ...themeData, isActive: true } });
    }
    // Clear existing specials and re-create
    await prisma.dailySpecial.deleteMany({ where: { dayThemeId: theme.id } });
    for (const special of specials) {
      const { isFeatured, ...rest } = special;
      await prisma.dailySpecial.create({
        data: {
          dayThemeId: theme.id,
          ...rest,
          isFeatured: isFeatured || false,
          isActive: true,
        }
      });
    }
    console.log(`  ${dt.dayOfWeek}: ${dt.name} (${specials.length} specials)`);
  }

  // ─── Seed Flight Schedule ───
  console.log('\nSeeding flight schedule...');

  const flights = [
    {
      month: 2, year: 2026, theme: 'American Single Malts', price: '$15',
      description: 'Explore the rising tide of American single malt whiskey.',
      pours: [
        { spiritName: 'Westward American Single Malt', pourSize: '1 oz', description: 'Portland, Oregon', tastingNotes: 'Rich malt, dark fruit, baking spice', displayOrder: 0 },
        { spiritName: 'Balcones Texas Single Malt', pourSize: '1 oz', description: 'Waco, Texas', tastingNotes: 'Toasted oak, honey, smoked caramel', displayOrder: 1 },
        { spiritName: 'Stranahan\'s Colorado Whiskey', pourSize: '1 oz', description: 'Denver, Colorado', tastingNotes: 'Butterscotch, vanilla, dried fruit', displayOrder: 2 },
      ]
    },
    {
      month: 3, year: 2026, theme: 'Irish Whiskey Renaissance', price: '$15',
      description: 'The new wave of Irish whiskey beyond the old guard.',
      pours: [
        { spiritName: 'Redbreast 12', pourSize: '1 oz', description: 'Midleton, Ireland', tastingNotes: 'Sherry, dried fruit, toasted wood', displayOrder: 0 },
        { spiritName: 'Green Spot', pourSize: '1 oz', description: 'Midleton, Ireland', tastingNotes: 'Green apple, vanilla, toasted barley', displayOrder: 1 },
        { spiritName: 'Teeling Small Batch', pourSize: '1 oz', description: 'Dublin, Ireland', tastingNotes: 'Rum cask influence, tropical fruit, spice', displayOrder: 2 },
      ]
    },
    {
      month: 4, year: 2026, theme: 'Japanese Whisky Craft', price: '$18',
      description: 'Precision and artistry from Japanese distillers.',
      pours: [
        { spiritName: 'Nikka Coffey Grain', pourSize: '0.75 oz', description: 'Miyagi, Japan', tastingNotes: 'Corn sweetness, citrus, vanilla cream', displayOrder: 0 },
        { spiritName: 'Hakushu Distiller\'s Reserve', pourSize: '0.75 oz', description: 'Yamanashi, Japan', tastingNotes: 'Fresh herbs, green apple, light smoke', displayOrder: 1 },
        { spiritName: 'Iwai Tradition', pourSize: '0.75 oz', description: 'Nagano, Japan', tastingNotes: 'Dried cherry, cinnamon, gentle oak', displayOrder: 2 },
      ]
    },
    {
      month: 5, year: 2026, theme: 'Bourbon Trail Legends', price: '$15',
      description: 'Iconic bourbon expressions from Kentucky and beyond.',
      pours: [
        { spiritName: 'Four Roses Single Barrel', pourSize: '1 oz', description: 'Lawrenceburg, Kentucky', tastingNotes: 'Ripe plum, cocoa, maple', displayOrder: 0 },
        { spiritName: 'Wild Turkey Rare Breed', pourSize: '1 oz', description: 'Lawrenceburg, Kentucky', tastingNotes: 'Bold spice, orange peel, caramel', displayOrder: 1 },
        { spiritName: 'Elijah Craig Small Batch', pourSize: '1 oz', description: 'Bardstown, Kentucky', tastingNotes: 'Vanilla, charred oak, brown sugar', displayOrder: 2 },
      ]
    },
    {
      month: 6, year: 2026, theme: 'Scotch Regions Tour', price: '$18',
      description: 'A journey through the distinct regions of Scottish whisky.',
      pours: [
        { spiritName: 'Glenfiddich 15 Solera', pourSize: '0.75 oz', description: 'Speyside, Scotland', tastingNotes: 'Honey, sherry, dark fruit, nutmeg', displayOrder: 0 },
        { spiritName: 'Talisker 10', pourSize: '0.75 oz', description: 'Isle of Skye, Scotland', tastingNotes: 'Sea salt, pepper, peat smoke', displayOrder: 1 },
        { spiritName: 'Auchentoshan Three Wood', pourSize: '0.75 oz', description: 'Lowlands, Scotland', tastingNotes: 'Toffee, blackberry, dark chocolate', displayOrder: 2 },
      ]
    },
    {
      month: 7, year: 2026, theme: 'Rye Revival', price: '$15',
      description: 'The bold, spicy character of American rye whiskey.',
      pours: [
        { spiritName: 'Rittenhouse Rye BiB', pourSize: '1 oz', description: 'Bardstown, Kentucky', tastingNotes: 'Black pepper, cherry, baking spice', displayOrder: 0 },
        { spiritName: 'WhistlePig 6 PiggyBack', pourSize: '1 oz', description: 'Shoreham, Vermont', tastingNotes: 'Caramel, clove, minty rye', displayOrder: 1 },
        { spiritName: 'Sagamore Spirit', pourSize: '1 oz', description: 'Baltimore, Maryland', tastingNotes: 'Sweet vanilla, cinnamon, rye bread', displayOrder: 2 },
      ]
    },
    {
      month: 8, year: 2026, theme: 'World Whiskey Discovery', price: '$18',
      description: 'Outstanding whiskeys from unexpected places around the globe.',
      pours: [
        { spiritName: 'Kavalan Concertmaster', pourSize: '0.75 oz', description: 'Yilan County, Taiwan', tastingNotes: 'Port wine, tropical fruit, marzipan', displayOrder: 0 },
        { spiritName: 'Starward Nova', pourSize: '0.75 oz', description: 'Melbourne, Australia', tastingNotes: 'Red berries, caramel, wine cask spice', displayOrder: 1 },
        { spiritName: 'Amrut Fusion', pourSize: '0.75 oz', description: 'Bangalore, India', tastingNotes: 'Peated malt, honey, fruit cake', displayOrder: 2 },
      ]
    },
  ];

  for (const fl of flights) {
    const { pours, ...flightData } = fl;
    const existing = await prisma.flight.findFirst({
      where: { month: fl.month, year: fl.year, locationId: null }
    });
    let flight;
    if (existing) {
      flight = await prisma.flight.update({ where: { id: existing.id }, data: { theme: flightData.theme, description: flightData.description, price: flightData.price, isActive: true } });
      await prisma.flightPour.deleteMany({ where: { flightId: flight.id } });
    } else {
      flight = await prisma.flight.create({ data: { ...flightData, isActive: true } });
    }
    for (const pour of pours) {
      await prisma.flightPour.create({ data: { flightId: flight.id, ...pour } });
    }
    console.log(`  ${fl.month}/${fl.year}: ${fl.theme} (${pours.length} pours)`);
  }

  // ─── Seed Sunday Break Even Bottles ───
  console.log('\nSeeding Sunday bottles...');

  const sundayBottles = [
    { month: 2, year: 2026, name: 'Buffalo Trace Bourbon', costPrice: '$22', regularPrice: '$40', category: 'bourbon', displayOrder: 0 },
    { month: 2, year: 2026, name: 'Monkey Shoulder Blended Malt', costPrice: '$28', regularPrice: '$50', category: 'scotch', displayOrder: 1 },
    { month: 3, year: 2026, name: 'Jameson Irish Whiskey', costPrice: '$20', regularPrice: '$38', category: 'irish', displayOrder: 0 },
    { month: 3, year: 2026, name: 'Woodford Reserve', costPrice: '$30', regularPrice: '$52', category: 'bourbon', displayOrder: 1 },
    { month: 4, year: 2026, name: 'Maker\'s Mark', costPrice: '$24', regularPrice: '$44', category: 'bourbon', displayOrder: 0 },
    { month: 4, year: 2026, name: 'Glenfiddich 12', costPrice: '$35', regularPrice: '$60', category: 'scotch', displayOrder: 1 },
  ];

  for (const bottle of sundayBottles) {
    const existing = await prisma.featuredBottle.findFirst({
      where: { month: bottle.month, year: bottle.year, name: bottle.name, locationId: null }
    });
    if (existing) {
      await prisma.featuredBottle.update({ where: { id: existing.id }, data: bottle });
    } else {
      await prisma.featuredBottle.create({ data: { ...bottle, isActive: true } });
    }
  }
  console.log(`  ${sundayBottles.length} bottles seeded`);

  console.log('\nSeeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
