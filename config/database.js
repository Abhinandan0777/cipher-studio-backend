const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // MongoDB Atlas optimized connection options
    const options = {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      family: 4 // Use IPv4, skip trying IPv6
    };

    const conn = await mongoose.connect(process.env.MONGODB_URI, options);

    console.log(`📦 MongoDB Atlas Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️  MongoDB disconnected');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });

  } catch (error) {
    console.error('❌ MongoDB Atlas connection failed:', error.message);
    
    // Provide helpful error messages
    if (error.message.includes('authentication failed')) {
      console.error('💡 Check your username and password in the connection string');
    } else if (error.message.includes('network')) {
      console.error('💡 Check your network access settings in MongoDB Atlas');
    } else if (error.message.includes('ENOTFOUND')) {
      console.error('💡 Check your connection string format');
    }
    
    // In development, continue without DB for now
    if (process.env.NODE_ENV === 'development') {
      console.log('⚠️  Continuing in development mode without database');
      return;
    }
    
    process.exit(1);
  }
};

module.exports = connectDB;