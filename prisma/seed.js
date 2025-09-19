const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database with Dram & Draught locations...');

  // Create Dram & Draught locations
  const locations = [
    {
      name: 'Greensboro',
      slug: 'greensboro',
      city: 'Greensboro',
      state: 'NC',
      address: '300 West Gate City Blvd',
      zipCode: '27406',
      phone: '',
      email: 'greensboro@dramanddraught.com',
      specialText: '300+ Whiskeys | Craft Cocktails | NC Beers',
      hours: {
        monday: '4:00 PM - 12:00 AM',
        tuesday: '4:00 PM - 12:00 AM',
        wednesday: '4:00 PM - 12:00 AM',
        thursday: '4:00 PM - 2:00 AM',
        friday: '4:00 PM - 2:00 AM',
        saturday: '12:00 PM - 2:00 AM',
        sunday: '12:00 PM - 12:00 AM'
      },
      features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Indoor & Outdoor Seating'],
      facebook: 'https://facebook.com/DramandDraughtGreensboro',
      instagram: 'https://instagram.com/dramanddraught',
      menuUrl: 'https://www.dramanddraught.com/menus/',
      isActive: true
    },
    {
      name: 'Raleigh',
      slug: 'raleigh',
      city: 'Raleigh',
      state: 'NC',
      address: '1 Glenwood Avenue, Suite 101',
      zipCode: '27603',
      phone: '',
      email: 'raleigh@dramanddraught.com',
      specialText: 'Glenwood South Location | Happy Hour Daily',
      hours: {
        monday: '3:00 PM - 2:00 AM',
        tuesday: '3:00 PM - 2:00 AM',
        wednesday: '3:00 PM - 2:00 AM',
        thursday: '3:00 PM - 2:00 AM',
        friday: '3:00 PM - 2:00 AM',
        saturday: '12:00 PM - 2:00 AM',
        sunday: '12:00 PM - 12:00 AM'
      },
      features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Late Night'],
      instagram: 'https://instagram.com/dramanddraught',
      facebook: 'https://facebook.com/DramandDraughtRaleigh',
      menuUrl: 'https://www.dramanddraught.com/menus/',
      isActive: true
    },
    {
      name: 'Durham',
      slug: 'durham',
      city: 'Durham',
      state: 'NC',
      address: '701 W. Main Street Suite 123',
      zipCode: '27701',
      phone: '',
      email: 'durham@dramanddraught.com',
      specialText: 'Downtown Durham | Brightleaf Square',
      hours: {
        monday: '3:00 PM - 12:00 AM',
        tuesday: '3:00 PM - 12:00 AM',
        wednesday: '3:00 PM - 12:00 AM',
        thursday: '3:00 PM - 12:00 AM',
        friday: '3:00 PM - 2:00 AM',
        saturday: '12:00 PM - 2:00 AM',
        sunday: '12:00 PM - 12:00 AM'
      },
      features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Historic Location'],
      facebook: 'https://facebook.com/DramandDraughtDurham',
      instagram: 'https://instagram.com/dramanddraught',
      menuUrl: 'https://www.dramanddraught.com/menus/',
      isActive: true
    },
    {
      name: 'Winston-Salem',
      slug: 'winston-salem',
      city: 'Winston-Salem',
      state: 'NC',
      address: '486 North Patterson Avenue STE 120',
      zipCode: '27101',
      phone: '',
      email: 'winston@dramanddraught.com',
      specialText: 'Innovation Quarter | Indoor & Outdoor Seating',
      hours: {
        monday: '3:00 PM - 12:00 AM',
        tuesday: '3:00 PM - 12:00 AM',
        wednesday: '3:00 PM - 12:00 AM',
        thursday: '3:00 PM - 2:00 AM',
        friday: '3:00 PM - 2:00 AM',
        saturday: '12:00 PM - 2:00 AM',
        sunday: '12:00 PM - 12:00 AM'
      },
      features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Outdoor Patio'],
      facebook: 'https://facebook.com/DramandDraughtWinston',
      instagram: 'https://instagram.com/dramanddraughtwinston',
      menuUrl: 'https://www.dramanddraught.com/menus/',
      isActive: true
    },
    {
      name: 'Cary',
      slug: 'cary',
      city: 'Cary',
      state: 'NC',
      address: '3 Fenton Main St',
      zipCode: '27511',
      phone: '',
      email: 'cary@dramanddraught.com',
      specialText: 'Fenton Development | Extended Weekend Hours',
      hours: {
        monday: '4:00 PM - 12:00 AM',
        tuesday: '12:00 PM - 12:00 AM',
        wednesday: '12:00 PM - 12:00 AM',
        thursday: '12:00 PM - 12:00 AM',
        friday: '12:00 PM - 2:00 AM',
        saturday: '12:00 PM - 2:00 AM',
        sunday: '12:00 PM - 11:00 PM'
      },
      features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Family Friendly'],
      facebook: 'https://facebook.com/DramandDraughtCary',
      instagram: 'https://instagram.com/dramanddraught',
      menuUrl: 'https://www.dramanddraught.com/menus/',
      isActive: true
    },
    {
      name: 'Charlotte',
      slug: 'charlotte',
      city: 'Charlotte',
      state: 'NC',
      address: '1220 S Tryon St',
      zipCode: '28203',
      phone: '',
      email: 'charlotte@dramanddraught.com',
      specialText: 'South End Location | Open Late',
      hours: {
        monday: '3:00 PM - 2:00 AM',
        tuesday: '3:00 PM - 2:00 AM',
        wednesday: '3:00 PM - 2:00 AM',
        thursday: '3:00 PM - 2:00 AM',
        friday: '3:00 PM - 2:00 AM',
        saturday: '12:00 PM - 2:00 AM',
        sunday: '12:00 PM - 12:00 AM'
      },
      features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Late Night', 'South End'],
      facebook: 'https://facebook.com/DramandDraughtCLT',
      instagram: 'https://instagram.com/dramanddraught',
      menuUrl: 'https://www.dramanddraught.com/menus/',
      isActive: true
    },
    {
      name: 'Wilmington',
      slug: 'wilmington',
      city: 'Wilmington',
      state: 'NC',
      address: '109 Market St',
      zipCode: '28401',
      phone: '',
      email: 'wilmington@dramanddraught.com',
      specialText: 'Historic Downtown | Steps from Riverwalk',
      hours: {
        monday: '2:00 PM - 12:00 AM',
        tuesday: '2:00 PM - 12:00 AM',
        wednesday: '2:00 PM - 12:00 AM',
        thursday: '2:00 PM - 12:00 AM',
        friday: '12:00 PM - 2:00 AM',
        saturday: '12:00 PM - 2:00 AM',
        sunday: '12:00 PM - 12:00 AM'
      },
      features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Historic Downtown', 'Near Riverwalk'],
      facebook: 'https://facebook.com/DramandDraughtWilmington',
      instagram: 'https://instagram.com/dramanddraught',
      menuUrl: 'https://www.dramanddraught.com/menus/',
      isActive: true
    }
  ];

  // Clear existing data
  await prisma.location.deleteMany({});

  // Create locations with sample menu categories
  for (const location of locations) {
    const created = await prisma.location.create({
      data: {
        ...location,
        menuCategories: {
          create: [
            {
              name: 'Signature Cocktails',
              description: 'Hand-crafted cocktails from our expert mixologists',
              displayOrder: 1,
              isActive: true,
              items: {
                create: [
                  {
                    name: 'Old Fashioned',
                    description: 'Bourbon, bitters, sugar, orange',
                    price: 12,
                    isAvailable: true,
                    displayOrder: 1
                  },
                  {
                    name: 'Moscow Mule',
                    description: 'Vodka, ginger beer, lime',
                    price: 11,
                    isAvailable: true,
                    displayOrder: 2
                  },
                  {
                    name: 'Whiskey Sour',
                    description: 'Whiskey, lemon juice, simple syrup',
                    price: 11,
                    isAvailable: true,
                    displayOrder: 3
                  }
                ]
              }
            },
            {
              name: 'Draft Beer',
              description: 'Rotating selection of North Carolina craft beers',
              displayOrder: 2,
              isActive: true,
              items: {
                create: [
                  {
                    name: 'Local IPA',
                    description: 'Ask about our rotating IPA selection',
                    price: 7,
                    isAvailable: true,
                    displayOrder: 1
                  },
                  {
                    name: 'Seasonal Draft',
                    description: 'Featured seasonal beer',
                    price: 8,
                    isAvailable: true,
                    displayOrder: 2
                  }
                ]
              }
            },
            {
              name: 'Wine Selection',
              description: 'Curated wines from around the world',
              displayOrder: 3,
              isActive: true,
              items: {
                create: [
                  {
                    name: 'House Red',
                    description: 'Ask about our current selection',
                    price: 9,
                    isAvailable: true,
                    displayOrder: 1
                  },
                  {
                    name: 'House White',
                    description: 'Ask about our current selection',
                    price: 9,
                    isAvailable: true,
                    displayOrder: 2
                  }
                ]
              }
            }
          ]
        }
      }
    });
    console.log(`Created Dram & Draught ${created.name} location`);
  }

  // Add sample events for some locations
  const raleighLocation = await prisma.location.findUnique({ where: { slug: 'raleigh' } });
  if (raleighLocation) {
    await prisma.event.create({
      data: {
        locationId: raleighLocation.id,
        title: 'Whiskey Wednesday',
        description: '$2 off all whiskey pours',
        startDate: new Date('2025-09-25T16:00:00'),
        endDate: new Date('2025-09-25T23:00:00'),
        isActive: true
      }
    });
  }

  const charlotteLocation = await prisma.location.findUnique({ where: { slug: 'charlotte' } });
  if (charlotteLocation) {
    await prisma.event.create({
      data: {
        locationId: charlotteLocation.id,
        title: 'Live Music Friday',
        description: 'Local bands starting at 8 PM',
        startDate: new Date('2025-09-27T20:00:00'),
        isActive: true
      }
    });
  }

  console.log('Seeding complete! All Dram & Draught locations added.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });