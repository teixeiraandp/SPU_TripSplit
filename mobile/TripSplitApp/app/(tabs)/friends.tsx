import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  searchUsers,
  fetchFriends,
  addFriend,
  removeFriend,
  fetchFriendInvites,
  FriendInvite,
  acceptFriendInvite,
  declineFriendInvite,
} from '@/utils/api';
import { Colors, Spacing, FontSizes, BorderRadius } from '@/constants/theme';
import { User } from '@/types';

function timeAgo(iso: string) {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now - t);

  const mins = Math.floor(diff / (1000 * 60));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;

  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export default function FriendsScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [friendInvites, setFriendInvites] = useState<FriendInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [hasSearched, setHasSearched] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  const loadFriends = async () => {
    try {
      const [friendsData, invitesData] = await Promise.all([
        fetchFriends(),
        fetchFriendInvites(),
      ]);
      setFriends(friendsData);
      setFriendInvites(invitesData);
    } catch (error) {
      console.log('Failed to load friends:', error);
    } finally {
      setLoadingFriends(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadFriends();
    }, [])
  );

  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    if (query.length < 2) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);
    try {
      const results = await searchUsers(query);
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFriend = async (user: User) => {
    setAddingId(user.id);
    try {
      await addFriend(user.username);
      Alert.alert('Request Sent', `Friend request sent to @${user.username}!`);
      setSearchQuery('');
      setSearchResults([]);
      setHasSearched(false);
      loadFriends();
    } catch (error: any) {
      if (error.message?.includes('Already friends')) {
        Alert.alert('Already Friends', `You're already friends with ${user.username}`);
      } else if (error.message?.includes('already sent')) {
        Alert.alert('Already Sent', `Friend request already sent to ${user.username}`);
      } else {
        Alert.alert('Error', error.message || 'Failed to send friend request');
      }
    } finally {
      setAddingId(null);
    }
  };

  const handleRemoveFriend = (user: User) => {
    Alert.alert(
      'Remove Friend',
      `Remove ${user.username} from your friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeFriend(user.id);
              await loadFriends();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to remove friend');
            }
          },
        },
      ]
    );
  };

  const handleAcceptInvite = async (invite: FriendInvite) => {
    setRespondingTo(invite.id);
    try {
      await acceptFriendInvite(invite.id);
      Alert.alert('Friend Added!', `You are now friends with @${invite.sender.username}`);
      loadFriends();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to accept friend request');
    } finally {
      setRespondingTo(null);
    }
  };

  const handleDeclineInvite = async (invite: FriendInvite) => {
    Alert.alert(
      'Decline Friend Request',
      `Decline friend request from @${invite.sender.username}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setRespondingTo(invite.id);
            try {
              await declineFriendInvite(invite.id);
              loadFriends();
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to decline friend request');
            } finally {
              setRespondingTo(null);
            }
          },
        },
      ]
    );
  };

  const getInitials = (username: string) => {
    return username.slice(0, 2).toUpperCase();
  };

  const isFriend = (userId: string) => friends.some(f => f.id === userId);

  const renderSearchResult = ({ item }: { item: User }) => (
    <View style={styles.userCard}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{getInitials(item.username)}</Text>
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.username}>@{item.username}</Text>
        <Text style={styles.email}>{item.email}</Text>
      </View>
      <Pressable
        style={[
          styles.addButton,
          (isFriend(item.id) || addingId === item.id) && styles.addButtonDisabled,
        ]}
        onPress={() => handleAddFriend(item)}
        disabled={isFriend(item.id) || addingId === item.id}
      >
        <Text style={styles.addButtonText}>
          {isFriend(item.id) ? '✓ Friends' : addingId === item.id ? '...' : '+ Add'}
        </Text>
      </Pressable>
    </View>
  );

  const renderFriend = ({ item }: { item: User }) => (
    <Pressable
      style={styles.friendCard}
      onLongPress={() => handleRemoveFriend(item)}
    >
      <View style={styles.friendAvatar}>
        <Text style={styles.avatarText}>{getInitials(item.username)}</Text>
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.username}>@{item.username}</Text>
        <Text style={styles.email}>{item.email}</Text>
      </View>
    </Pressable>
  );

  const renderInvite = (invite: FriendInvite) => (
    <View key={invite.id} style={styles.inviteCard}>
      <View style={styles.inviteAvatar}>
        <Text style={styles.avatarText}>{getInitials(invite.sender.username)}</Text>
      </View>
      <View style={styles.inviteInfo}>
        <Text style={styles.username}>@{invite.sender.username}</Text>
        <Text style={styles.inviteTime}>{timeAgo(invite.createdAt)}</Text>
      </View>
      <View style={styles.inviteActions}>
        <Pressable
          style={[styles.inviteBtn, styles.acceptBtn]}
          onPress={() => handleAcceptInvite(invite)}
          disabled={respondingTo === invite.id}
        >
          <Text style={styles.acceptBtnText}>
            {respondingTo === invite.id ? '...' : 'Accept'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.inviteBtn, styles.declineBtn]}
          onPress={() => handleDeclineInvite(invite)}
          disabled={respondingTo === invite.id}
        >
          <Text style={styles.declineBtnText}>✕</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Friends</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by username to add friends..."
            placeholderTextColor={Colors.dark.textSecondary}
            value={searchQuery}
            onChangeText={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {(hasSearched || searchQuery.length >= 2) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Search Results</Text>
            {loading ? (
              <ActivityIndicator size="small" color={Colors.dark.tint} style={{ marginTop: 20 }} />
            ) : searchResults.length > 0 ? (
              <FlatList
                data={searchResults}
                renderItem={renderSearchResult}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
              />
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyTitle}>No users found</Text>
                <Text style={styles.emptySubtitle}>Try a different username</Text>
              </View>
            )}
          </View>
        )}

        {!hasSearched && searchQuery.length < 2 && (
          <>
            {/* Friend Requests Section */}
            {friendInvites.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Friend Requests ({friendInvites.length})</Text>
                {friendInvites.map(renderInvite)}
              </View>
            )}

            {/* My Friends Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>My Friends ({friends.length})</Text>
              {loadingFriends ? (
                <ActivityIndicator size="small" color={Colors.dark.tint} style={{ marginTop: 20 }} />
              ) : friends.length > 0 ? (
                <FlatList
                  data={friends}
                  renderItem={renderFriend}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.list}
                />
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>👥</Text>
                  <Text style={styles.emptyTitle}>No friends yet</Text>
                  <Text style={styles.emptySubtitle}>
                    Search for users above to add them as friends
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        <Text style={styles.hint}>
          💡 Long press on a friend to remove them
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSizes['2xl'],
    fontWeight: '600',
    color: Colors.dark.text,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  searchContainer: {
    marginBottom: Spacing.md,
  },
  searchInput: {
    backgroundColor: Colors.dark.cardSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.dark.text,
  },
  section: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.dark.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  hint: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
    paddingBottom: Spacing.lg,
  },
  list: {
    paddingBottom: Spacing.xl,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.cardSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.cardSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.cardSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.tint,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  inviteAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  avatarText: {
    fontSize: FontSizes.base,
    fontWeight: '600',
    color: '#fff',
  },
  userInfo: {
    flex: 1,
  },
  inviteInfo: {
    flex: 1,
  },
  username: {
    fontSize: FontSizes.base,
    fontWeight: '600',
    color: Colors.dark.text,
    marginBottom: 2,
  },
  email: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
  },
  inviteTime: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
  },
  addButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.tint,
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: '#fff',
  },
  inviteActions: {
    flexDirection: 'row',
    gap: 8,
  },
  inviteBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
  },
  acceptBtn: {
    backgroundColor: Colors.dark.tint,
  },
  acceptBtnText: {
    color: '#fff',
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  declineBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  declineBtnText: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.dark.text,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: FontSizes.md,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
  },
});