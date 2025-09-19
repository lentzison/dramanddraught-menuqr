const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create locations
  const locations = [
    {
      name: 'Greensboro',
      slug: 'greensboro',
      city: 'Greensboro',
      state: 'NC',
      address: '123 Main St',
      zipCode: '27401',
      phone: '(336) 555-0001',
      email: 'greensboro@menuqr.com',
      hours: {
        monday: '11:00 AM - 10:00 PM',
        tuesday: '11:00 AM - 10:00 PM',
        wednesday: '11:00 AM - 10:00 PM',
        thursday: '11:00 AM - 10:00 PM',
        friday: '11:00 AM - 11:00 PM',
        saturday: '11:00 AM - 11:00 PM',
        sunday: '12:00 PM - 9:00 PM'
      },
      features: ['Outdoor Seating', 'Free WiFi', 'Parking'],
      isActive: true
    },
    {
      name: 'Raleigh',
      slug: 'raleigh',
      city: 'Raleigh',
      state: 'NC',
      address: '456 Capital Ave',
      zipCode: '27601',
      phone: '(919) 555-0002',
      email: 'raleigh@menuqr.com',
      hours: {
        monday: '11:00 AM - 10:00 PM',
        tuesday: '11:00 AM - 10:00 PM',
        wednesday: '11:00 AM - 10:00 PM',
        thursday: '11:00 AM - 10:00 PM',
        friday: '11:00 AM - 11:00 PM',
        saturday: '11:00 AM - 11:00 PM',
        sunday: '12:00 PM - 9:00 PM'
      },
      features: ['Live Music', 'Happy Hour', 'Private Events'],
      isActive: true
    },
    {
      name: 'Durham',
      slug: 'durham',
      city: 'Durham',
      state: 'NC',
      address: '789 Bull City Blvd',
      zipCode: '27701',
      phone: '(919) 555-0003',
      email: 'durham@menuqr.com',
      hours: {
        monday: '11:00 AM - 10:00 PM',
        tuesday: '11:00 AM - 10:00 PM',
        wednesday: '11:00 AM - 10:00 PM',
        thursday: '11:00 AM - 10:00 PM',
        friday: '11:00 AM - 11:00 PM',
        saturday: '11:00 AM - 11:00 PM',
        sunday: '12:00 PM - 9:00 PM'
      },
      features: ['Craft Beer', 'Vegan Options', 'Dog Friendly'],
      isActive: true
    },
    {
      name: 'Winston-Salem',
      slug: 'winston',
      city: 'Winston-Salem',
      state: 'NC',
      address: '321 Innovation Dr',
      zipCode: '27101',
      phone: '(336) 555-0004',
      email: 'winston@menuqr.com',
      hours: {
        monday: '11:00 AM - 10:00 PM',
        tuesday: '11:00 AM - 10:00 PM',
        wednesday: '11:00 AM - 10:00 PM',
        thursday: '11:00 AM - 10:00 PM',
        friday: '11:00 AM - 11:00 PM',
        saturday: '11:00 AM - 11:00 PM',
        sunday: '12:00 PM - 9:00 PM'
      },
      features: ['Historic District', 'Catering', 'Takeout'],
      isActive: true
    },
    {
      name: 'Cary',
      slug: 'cary',
      city: 'Cary',
      state: 'NC',
      address: '555 Park Center Dr',
      zipCode: '27511',
      phone: '(919) 555-0005',
      email: 'cary@menuqr.com',
      hours: {
        monday: '11:00 AM - 10:00 PM',
        tuesday: '11:00 AM - 10:00 PM',
        wednesday: '11:00 AM - 10:00 PM',
        thursday: '11:00 AM - 10:00 PM',
        friday: '11:00 AM - 11:00 PM',
        saturday: '11:00 AM - 11:00 PM',
        sunday: '12:00 PM - 9:00 PM'
      },
      features: ['Family Friendly', 'Kids Menu', 'Delivery'],
      isActive: true
    },
    {
      name: 'Charlotte',
      slug: 'charlotte',
      city: 'Charlotte',
      state: 'NC',
      address: '999 Queen City Ave',
      zipCode: '28201',
      phone: '(704) 555-0006',
      email: 'charlotte@menuqr.com',
      hours: {
        monday: '11:00 AM - 11:00 PM',
        tuesday: '11:00 AM - 11:00 PM',
        wednesday: '11:00 AM - 11:00 PM',
        thursday: '11:00 AM - 11:00 PM',
        friday: '11:00 AM - 12:00 AM',
        saturday: '11:00 AM - 12:00 AM',
        sunday: '11:00 AM - 10:00 PM'
      },
      features: ['Rooftop Bar', 'Full Bar', 'Late Night'],
      isActive: true
    },
    {
      name: 'Wilmington',
      slug: 'wilmington',
      city: 'Wilmington',
      state: 'NC',
      address: '777 Beach Rd',
      zipCode: '28401',
      phone: '(910) 555-0007',
      email: 'wilmington@menuqr.com',
      hours: {
        monday: '11:00 AM - 10:00 PM',
        tuesday: '11:00 AM - 10:00 PM',
        wednesday: '11:00 AM - 10:00 PM',
        thursday: '11:00 AM - 10:00 PM',
        friday: '11:00 AM - 11:00 PM',
        saturday: '11:00 AM - 11:00 PM',
        sunday: '11:00 AM - 9:00 PM'
      },
      features: ['Ocean View', 'Fresh Seafood', 'Beach Access'],
      isActive: true
    }
  ];

  // Clear existing data
  await prisma.location.deleteMany({});

  // Create locations
  for (const location of locations) {
    const created = await prisma.location.create({
      data: location
    });
    console.log(`Created location: ${created.name}`);
  }

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });