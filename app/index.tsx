import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';

// Import the JSON file directly
import initialUsers from '../assets/users.json';

export default function App() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [db, setDb] = useState(null);
  const [isFirstRun, setIsFirstRun] = useState(true);

  // Initialize database on component mount
  useEffect(() => {
    initializeDatabase();
  }, []);

  // Initialize the database and load initial data if first run
  const initializeDatabase = async () => {
    try {
      setLoading(true);
      console.log('Initializing database...');
      
      // Open the database
      const database = await SQLite.openDatabaseAsync('user.db');
      setDb(database);
      
      // Create table if it doesn't exist
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      // Check if we need to import initial data
      const result = await database.getAllAsync('SELECT COUNT(*) as count FROM users');
      const userCount = result[0].count;
      
      if (userCount === 0) {
        console.log('Database is empty, importing initial data...');
        
        // Insert initial data into database
        for (const user of initialUsers) {
          await database.runAsync(
            'INSERT INTO users (name, email, created_at) VALUES (?, ?, ?)',
            [user.name, user.email, user.created_at || new Date().toISOString()]
          );
        }
        
        console.log(`Imported ${initialUsers.length} users from JSON to database`);
        setIsFirstRun(true);
      } else {
        console.log(`Database already has ${userCount} users, skipping initial import`);
        setIsFirstRun(false);
      }
      
      // Load users from database
      await loadUsers();
      
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Error initializing database:', error);
      Alert.alert('Database Error', 'Failed to initialize database');
    } finally {
      setLoading(false);
    }
  };

  // Load users from the database
  const loadUsers = async () => {
    if (!db) return;
    
    try {
      setLoading(true);
      const allUsers = await db.getAllAsync('SELECT * FROM users ORDER BY created_at DESC');
      setUsers(allUsers);
      console.log(`Loaded ${allUsers.length} users from database`);
    } catch (error) {
      console.error('Error loading users:', error);
      Alert.alert('Error', 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  // Add a new user
  const addUser = async () => {
    // Validation
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Please enter a name');
      return;
    }

    if (!email.trim()) {
      Alert.alert('Validation Error', 'Please enter an email');
      return;
    }

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Validation Error', 'Please enter a valid email address');
      return;
    }

    if (!db) {
      Alert.alert('Database Error', 'Database not initialized');
      return;
    }

    try {
      await db.runAsync(
        'INSERT INTO users (name, email) VALUES (?, ?)',
        [name.trim(), email.trim()]
      );

      // Clear form
      setName('');
      setEmail('');
      
      // Reload users
      await loadUsers();
      
      Alert.alert('Success', 'User added successfully');
    } catch (error) {
      console.error('Error adding user:', error);
      
      // Check if it's a unique constraint error (duplicate email)
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        Alert.alert('Error', 'A user with this email already exists');
      } else {
        Alert.alert('Error', 'Failed to add user');
      }
    }
  };

  // Delete a user
  const deleteUser = async (id, userName) => {
    if (!db) return;

    Alert.alert(
      'Confirm Delete',
      `Are you sure you want to delete ${userName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await db.runAsync('DELETE FROM users WHERE id = ?', [id]);
              await loadUsers();
              Alert.alert('Success', 'User deleted successfully');
            } catch (error) {
              console.error('Error deleting user:', error);
              Alert.alert('Error', 'Failed to delete user');
            }
          }
        }
      ]
    );
  };

  // Clear all users
  const clearAllUsers = async () => {
    if (!db) return;

    Alert.alert(
      'Clear All Data',
      'Are you sure you want to delete all users? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              await db.runAsync('DELETE FROM users');
              await loadUsers();
              Alert.alert('Success', 'All users deleted successfully');
            } catch (error) {
              console.error('Error clearing users:', error);
              Alert.alert('Error', 'Failed to clear users');
            }
          }
        }
      ]
    );
  };

  // Update a user
  const updateUser = async (id, newName, newEmail) => {
    if (!db) return;

    try {
      await db.runAsync(
        'UPDATE users SET name = ?, email = ? WHERE id = ?',
        [newName, newEmail, id]
      );
      await loadUsers();
      Alert.alert('Success', 'User updated successfully');
    } catch (error) {
      console.error('Error updating user:', error);
      
      // Check if it's a unique constraint error (duplicate email)
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        Alert.alert('Error', 'A user with this email already exists');
      } else {
        Alert.alert('Error', 'Failed to update user');
      }
    }
  };

  // Search users
  const handleSearch = (text) => {
    setSearchTerm(text);
    
    if (!text.trim()) {
      loadUsers(); // Reload all users if search is empty
      return;
    }
    
    if (!db) return;
    
    // Search in the database
    db.getAllAsync(
      'SELECT * FROM users WHERE name LIKE ? OR email LIKE ? ORDER BY created_at DESC',
      [`%${text}%`, `%${text}%`]
    ).then(results => {
      setUsers(results);
    }).catch(error => {
      console.error('Error searching users:', error);
    });
  };

  // Clear search and reload all users
  const clearSearch = () => {
    setSearchTerm('');
    loadUsers();
  };

  // Reset database to original state (from JSON)
  const resetDatabase = async () => {
    Alert.alert(
      'Reset Database',
      'Are you sure you want to reset the database to its original state? All changes will be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              
              // Clear the database
              await db.runAsync('DELETE FROM users');
              
              // Insert initial data into database again
              for (const user of initialUsers) {
                await db.runAsync(
                  'INSERT INTO users (name, email, created_at) VALUES (?, ?, ?)',
                  [user.name, user.email, user.created_at || new Date().toISOString()]
                );
              }
              
              // Reload users
              await loadUsers();
              
              Alert.alert('Success', 'Database reset to original state');
            } catch (error) {
              console.error('Error resetting database:', error);
              Alert.alert('Error', 'Failed to reset database');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  // Export database to a downloadable file
  const exportDatabase = async () => {
    try {
      // Get all users from database
      const allUsers = await db.getAllAsync('SELECT * FROM users ORDER BY created_at DESC');
      const jsonData = JSON.stringify(allUsers, null, 2);
      
      // Save to a JSON file
      const exportPath = `${FileSystem.documentDirectory}users_export.json`;
      await FileSystem.writeAsStringAsync(exportPath, jsonData);
      
      Alert.alert(
        'Export Successful', 
        `Data exported to ${exportPath}`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error exporting database:', error);
      Alert.alert('Error', 'Failed to export data');
    }
  };

  // Render user item
  const renderUser = ({ item }) => (
    <View style={styles.userCard}>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.name}</Text>
        <Text style={styles.userEmail}>{item.email}</Text>
        <Text style={styles.userDate}>
          Added: {new Date(item.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.editButton]}
          onPress={() => {
            Alert.prompt(
              'Edit Name',
              'Enter new name:',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Update',
                  onPress: (newName) => {
                    if (newName && newName.trim()) {
                      Alert.prompt(
                        'Edit Email',
                        'Enter new email:',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Update',
                            onPress: (newEmail) => {
                              if (newEmail && newEmail.trim()) {
                                updateUser(item.id, newName.trim(), newEmail.trim());
                              }
                            }
                          }
                        ],
                        'plain-text',
                        item.email
                      );
                    }
                  }
                }
              ],
              'plain-text',
              item.name
            );
          }}
        >
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.button, styles.deleteButton]}
          onPress={() => deleteUser(item.id, item.name)}
        >
          <Text style={styles.buttonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Render empty component
  const renderEmptyComponent = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📭</Text>
      <Text style={styles.emptyTitle}>No users found</Text>
      <Text style={styles.emptyText}>Add some users to get started!</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView 
          style={styles.keyboardView} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>🗃️ Hybrid Data Management</Text>
            <Text style={styles.subtitle}>JSON → SQLite with CRUD Operations</Text>
            {isFirstRun && (
              <Text style={styles.firstRunIndicator}>
                Initial data loaded from JSON file
              </Text>
            )}
          </View>

          <ScrollView 
            style={styles.scrollView}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Add User Form */}
            <View style={styles.form}>
              <Text style={styles.formTitle}>Add New User</Text>
              
              <TextInput
                style={styles.input}
                placeholder="Enter full name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                returnKeyType="next"
                blurOnSubmit={false}
              />
              
              <TextInput
                style={styles.input}
                placeholder="Enter email address"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                blurOnSubmit={true}
                onSubmitEditing={addUser}
              />
              
              <TouchableOpacity 
                style={styles.addButton} 
                onPress={addUser}
                activeOpacity={0.7}
              >
                <Text style={styles.addButtonText}>✨ Add User</Text>
              </TouchableOpacity>
            </View>

            {/* Search Box */}
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search users by name or email"
                value={searchTerm}
                onChangeText={handleSearch}
              />
              {searchTerm.length > 0 && (
                <TouchableOpacity
                  style={styles.clearSearchButton}
                  onPress={clearSearch}
                >
                  <Text style={styles.clearSearchText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Users List */}
            <View style={styles.listContainer}>
              <View style={styles.listHeader}>
                <Text style={styles.listTitle}>
                  Users ({users.length})
                </Text>
                <View style={styles.headerButtons}>
                  {users.length > 0 && (
                    <TouchableOpacity
                      style={[styles.smallButton, styles.exportButton]}
                      onPress={exportDatabase}
                    >
                      <Text style={styles.smallButtonText}>Export</Text>
                    </TouchableOpacity>
                  )}
                  {users.length > 0 && (
                    <TouchableOpacity
                      style={[styles.smallButton, styles.resetButton]}
                      onPress={resetDatabase}
                    >
                      <Text style={styles.smallButtonText}>Reset</Text>
                    </TouchableOpacity>
                  )}
                  {users.length > 0 && (
                    <TouchableOpacity
                      style={[styles.smallButton, styles.clearButton]}
                      onPress={clearAllUsers}
                    >
                      <Text style={styles.smallButtonText}>Clear All</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {loading ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Loading users...</Text>
                </View>
              ) : users.length === 0 ? (
                renderEmptyComponent()
              ) : (
                <View style={styles.usersList}>
                  {users.map((item) => (
                    <View key={item.id.toString()}>
                      {renderUser({ item })}
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Database Info */}
            <View style={styles.infoContainer}>
              <Text style={styles.infoText}>
                Initial data loaded from: assets/users.json
              </Text>
              <Text style={styles.infoText}>
                All changes saved to: SQLite database
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  keyboardView: {
    flex: 1,
    padding: 20,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
    paddingTop: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
  },
  firstRunIndicator: {
    fontSize: 14,
    color: '#34C759',
    fontStyle: 'italic',
  },
  form: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 15,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  addButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
    marginTop: 5,
  },
  addButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 10,
    marginBottom: 20,
    paddingHorizontal: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 15,
    fontSize: 16,
  },
  clearSearchButton: {
    padding: 5,
  },
  clearSearchText: {
    fontSize: 18,
    color: '#999',
  },
  listContainer: {
    flex: 1,
    marginBottom: 20,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  listTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  smallButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  smallButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  exportButton: {
    backgroundColor: '#34C759',
  },
  resetButton: {
    backgroundColor: '#FF9500',
  },
  clearButton: {
    backgroundColor: '#FF3B30',
  },
  userCard: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  userDate: {
    fontSize: 12,
    color: '#999',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  buttonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  editButton: {
    backgroundColor: '#34C759',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 30,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 50,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  usersList: {
    paddingBottom: 10,
  },
  infoContainer: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  infoText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
});